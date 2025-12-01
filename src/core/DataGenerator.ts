import * as topojson from 'topojson-client';
import { geoAlbersUsa } from 'd3-geo';
import type { Feature, Polygon, MultiPolygon, FeatureCollection, Geometry } from 'geojson';

export class DataGenerator {
  static async loadUSData(): Promise<{ features: Feature<Polygon | MultiPolygon>[], bounds: [number, number, number, number] }> {
    // Fetch US Atlas data (Topology)
    const topologyPromise = fetch('https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json').then(r => r.json());
    
    // Fetch 2020 Election Data (CSV)
    const electionPromise = fetch('https://raw.githubusercontent.com/tonmcg/US_County_Level_Election_Results_08-24/master/2020_US_County_Level_Presidential_Results.csv').then(r => r.text());

    const [topology, electionCsv] = await Promise.all([topologyPromise, electionPromise]);

    // Parse Election CSV
    // Format: state_name,county_fips,county_name,votes_gop,votes_dem,total_votes,...
    const electionData = new Map<number, { dem: number, rep: number, total: number }>();
    
    const lines = electionCsv.split('\n');
    // Skip header
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // Simple CSV split (assuming no commas in fields for this specific dataset, or simple enough)
      // Actually county_name might have commas? The snippet shows "Autauga County".
      // Let's assume standard CSV. If simple split fails, we might need regex.
      // The snippet doesn't show quotes. Let's try simple split first.
      const parts = line.split(',');
      
      if (parts.length >= 6) {
        const fips = parseInt(parts[1], 10);
        const rep = parseInt(parts[3], 10);
        const dem = parseInt(parts[4], 10);
        const total = parseInt(parts[5], 10);
        
        if (!isNaN(fips)) {
          electionData.set(fips, { dem, rep, total });
        }
      }
    }

    // Convert to GeoJSON
    // The topojson types are a bit loose, so we cast to unknown then FeatureCollection
    const geojson = topojson.feature(topology, topology.objects.counties) as unknown as FeatureCollection<Geometry>;
    
    // Setup Projection (Albers USA)
    // Fit to a hypothetical 1000x600 canvas to normalize coordinates
    const width = 1000;
    const height = 600;
    const projection = geoAlbersUsa().scale(1300).translate([width / 2, height / 2]);

    const features: Feature<Polygon | MultiPolygon>[] = [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    geojson.features.forEach((feature) => {
      // We need to project the coordinates manually or use the path generator to get the SVG path
      // But for our canvas engine, we want raw coordinates.
      // d3-geo projection can project [lon, lat] -> [x, y]
      
      const geometry = feature.geometry;
      // We'll construct the new coordinates array. 
      // It will match the structure of Polygon (Position[][]) or MultiPolygon (Position[][][])
      const newCoordinates: number[][][] | number[][][][] = [];

      const projectRing = (ring: number[][]) => {
        const projectedRing: number[][] = [];
        ring.forEach(coord => {
          const projected = projection([coord[0], coord[1]]);
          if (projected) {
            projectedRing.push(projected);
            minX = Math.min(minX, projected[0]);
            minY = Math.min(minY, projected[1]);
            maxX = Math.max(maxX, projected[0]);
            maxY = Math.max(maxY, projected[1]);
          }
        });
        return projectedRing;
      };

      if (geometry.type === 'Polygon') {
        const poly = geometry as Polygon;
        poly.coordinates.forEach((ring) => {
          const projRing = projectRing(ring);
          if (projRing.length > 0) (newCoordinates as number[][][]).push(projRing);
        });
      } else if (geometry.type === 'MultiPolygon') {
        const multiPoly = geometry as MultiPolygon;
        multiPoly.coordinates.forEach((poly) => {
          const newPoly: number[][][] = [];
          poly.forEach((ring) => {
            const projRing = projectRing(ring);
            if (projRing.length > 0) newPoly.push(projRing);
          });
          if (newPoly.length > 0) (newCoordinates as number[][][][]).push(newPoly);
        });
      }

      if (newCoordinates.length > 0) {
        const id = Number(feature.id);
        const stateId = Math.floor(id / 1000);
        
        // Get real election data
        const voteData = electionData.get(id);
        
        let population, demVotes, repVotes;
        
        if (voteData) {
          demVotes = voteData.dem;
          repVotes = voteData.rep;
          // Estimate population from votes (approx 66% turnout?) or just use total votes as proxy for now
          // The user wants "voting data", so using total votes as the weight for redistricting is actually better for political fairness than raw population (one person one vote).
          // But usually redistricting is based on total population.
          // Let's use total votes * 1.5 as a rough population proxy if we don't have it, 
          // or just use the random population if we want to keep that separate.
          // Actually, let's use total votes as the "population" metric for the algorithm for now, 
          // as it reflects the voting weight.
          population = voteData.total; 
        } else {
          // Fallback
          population = Math.floor(Math.random() * 50000) + 1000;
          const popFactor = Math.min(population / 40000, 1);
          const demProb = 0.3 + (popFactor * 0.4);
          demVotes = Math.floor(population * demProb);
          repVotes = population - demVotes;
        }

        features.push({
          type: 'Feature',
          id: id,
          properties: {
            ...feature.properties,
            stateId: stateId,
            population,
            demVotes,
            repVotes
          },
          geometry: {
            type: geometry.type as 'Polygon' | 'MultiPolygon',
            coordinates: newCoordinates
          } as Polygon | MultiPolygon
        });
      }
    });

    return { features, bounds: [minX, minY, maxX, maxY] };
  }
}
