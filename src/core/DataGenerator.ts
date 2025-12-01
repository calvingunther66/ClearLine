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

    // Fetch Education/Income Data (CSV)
    const eduIncPromise = fetch('https://raw.githubusercontent.com/JieYingWu/COVID-19_US_County-level_Summaries/master/data/counties.csv').then(r => r.text());

    const [topology, electionCsv, demoCsv, eduIncCsv] = await Promise.all([topologyPromise, electionPromise, demoPromise, eduIncPromise]);

    // Parse Election CSV
    const electionData = new Map<number, { dem: number, rep: number }>();
    const electionLines = electionCsv.split('\n');
    for (let i = 1; i < electionLines.length; i++) {
      const line = electionLines[i].trim();
      if (!line) continue;
      const parts = line.split(',');
      if (parts.length >= 10) {
        const fips = parseInt(parts[1], 10); // county_fips
        const dem = parseInt(parts[4], 10); // votes_dem
        const rep = parseInt(parts[5], 10); // votes_gop
        if (!isNaN(fips)) {
          electionData.set(fips, { dem, rep });
        }
      }
    }

    // Parse Demographics CSV
    const demoData = new Map<number, { pop: number, white: number, black: number, hispanic: number }>();
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
        
        if (!isNaN(fips)) {
          demoData.set(fips, { pop, white, black, hispanic });
        }
      }
    }

    // Parse Education/Income CSV
    // FIPS is col 0
    // "Percent of adults with a bachelor's degree or higher 2014-18" is col 29 (approx)
    // "Median_Household_Income_2018" is col 48 (approx)
    // We need to be careful about commas in quoted fields. 
    // For now, let's assume standard CSV splitting works for these numeric columns if they are far enough right.
    // Actually, let's use a smarter regex split or just find the headers.
    
    const eduIncData = new Map<number, { education: number, income: number }>();
    const eduIncLines = eduIncCsv.split('\n');
    const headers = eduIncLines[0].split(',');
    const eduIdx = headers.findIndex((h: string) => h.includes("Percent of adults with a bachelor's degree or higher"));
    const incIdx = headers.findIndex((h: string) => h.includes("Median_Household_Income_2018"));

    if (eduIdx !== -1 && incIdx !== -1) {
      for (let i = 1; i < eduIncLines.length; i++) {
        const line = eduIncLines[i].trim();
        if (!line) continue;
        // Simple split might fail on quoted strings. 
        // Let's try to handle it roughly:
        // The FIPS is first. The data we want is numbers.
        // If we split by comma, we might get shifted indices.
        // Let's use a regex for splitting that respects quotes.
        const parts = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || line.split(',');
        // Clean up parts (remove quotes)
        const cleanParts = parts.map((p: string) => p.replace(/^"|"$/g, '').trim());
        
        // FIPS is usually first, but check header? Header says FIPS is 0.
        const fips = parseInt(cleanParts[0], 10);
        if (!isNaN(fips)) {
           const edu = parseFloat(cleanParts[eduIdx]);
           const inc = parseInt(cleanParts[incIdx], 10);
           if (!isNaN(edu) && !isNaN(inc)) {
             eduIncData.set(fips, { education: Math.round(edu), income: inc });
           }
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
        const eduInc = eduIncData.get(id);
        
        let population = 0, demVotes = 0, repVotes = 0;
        let white = 0, black = 0, hispanic = 0;
        let education = 0, income = 0;

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
        
        if (eduInc) {
          education = eduInc.education;
          income = eduInc.income;
        } else {
          education = 20 + Math.floor(Math.random() * 20);
          income = 40000 + Math.floor(Math.random() * 40000);
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
            hispanic,
            education,
            income
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
