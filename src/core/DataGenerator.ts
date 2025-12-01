import * as topojson from 'topojson-client';
import { geoAlbersUsa } from 'd3-geo';
import type { Feature, Polygon, MultiPolygon, FeatureCollection, Geometry } from 'geojson';

export class DataGenerator {
  static async loadUSData(): Promise<{ features: Feature<Polygon | MultiPolygon>[], bounds: [number, number, number, number] }> {
    // Fetch US Atlas data (Topology)
    const topologyPromise = fetch('https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json').then(r => r.json());
    
    // Fetch 2020 Election Data (CSV)
    const electionPromise = fetch('https://raw.githubusercontent.com/tonmcg/US_County_Level_Election_Results_08-24/master/2020_US_County_Level_Presidential_Results.csv').then(r => r.text());

    // Fetch Demographics Data (CSV)
    const demoPromise = fetch('https://raw.githubusercontent.com/plotly/datasets/master/minoritymajority.csv').then(r => r.text());

    const [topology, electionCsv, demoCsv] = await Promise.all([topologyPromise, electionPromise, demoPromise]);

    // Parse Election CSV
    const electionData = new Map<number, { dem: number, rep: number }>();
    const electionLines = electionCsv.split('\n');
    for (let i = 1; i < electionLines.length; i++) {
      const line = electionLines[i].trim();
      if (!line) continue;
      const parts = line.split(',');
      if (parts.length >= 6) {
        const fips = parseInt(parts[1], 10);
        const rep = parseInt(parts[3], 10);
        const dem = parseInt(parts[4], 10);
        if (!isNaN(fips)) {
          electionData.set(fips, { dem, rep });
        }
      }
    }

    // Parse Demographics CSV
    // FIPS,STNAME,CTYNAME,TOT_POP,TOT_MALE,TOT_FEMALE,WA_MALE,WA_FEMALE,NHWA_MALE,NHWA_FEMALE,NHWhite_Alone,Not_NHWhite_Alone,MinorityMinority,MinorityPCT,Black,BlackPCT,Hispanic,HispanicPCT
    const demoData = new Map<number, { pop: number, white: number, black: number, hispanic: number, asian: number }>();
    const demoLines = demoCsv.split('\n');
    for (let i = 1; i < demoLines.length; i++) {
      const line = demoLines[i].trim();
      if (!line) continue;
      const parts = line.split(',');
      if (parts.length >= 15) {
        const fips = parseInt(parts[0], 10);
        const pop = parseInt(parts[3], 10);
        const white = parseInt(parts[10], 10); // NHWhite_Alone
        const black = parseInt(parts[14], 10); // Black
        const hispanic = parseInt(parts[16], 10); // Hispanic
        // Asian is not explicitly in this CSV, we can infer "Other" or just use these 3
        
        if (!isNaN(fips)) {
          demoData.set(fips, { pop, white, black, hispanic, asian: 0 });
        }
      }
    }

    // Convert to GeoJSON
    const geojson = topojson.feature(topology, topology.objects.counties) as unknown as FeatureCollection<Geometry>;
    
    // Setup Projection (Albers USA)
    const width = 1000;
    const height = 600;
    const projection = geoAlbersUsa().scale(1300).translate([width / 2, height / 2]);

    const features: Feature<Polygon | MultiPolygon>[] = [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    geojson.features.forEach((feature) => {
      const geometry = feature.geometry;
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
        
        // Get real data
        const vote = electionData.get(id);
        const demo = demoData.get(id);
        
        let population = 0, demVotes = 0, repVotes = 0;
        let white = 0, black = 0, hispanic = 0;

        if (demo) {
          population = demo.pop;
          white = demo.white;
          black = demo.black;
          hispanic = demo.hispanic;
        } else {
          // Fallback population
          population = Math.floor(Math.random() * 50000) + 1000;
        }

        if (vote) {
          demVotes = vote.dem;
          repVotes = vote.rep;
        } else {
          // Fallback votes based on population density proxy
          const popFactor = Math.min(population / 40000, 1);
          const demProb = 0.3 + (popFactor * 0.4);
          demVotes = Math.floor(population * 0.6 * demProb); // Assume 60% turnout
          repVotes = Math.floor(population * 0.6) - demVotes;
        }

        features.push({
          type: 'Feature',
          id: id,
          properties: {
            ...feature.properties,
            stateId: stateId,
            population,
            demVotes,
            repVotes,
            white,
            black,
            hispanic
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
