import * as topojson from 'topojson-client';
import { geoAlbersUsa } from 'd3-geo';
import * as turf from '@turf/turf';
import type { Feature, Polygon, MultiPolygon, FeatureCollection, Geometry } from 'geojson';

export class DataGenerator {
  // Helper to subdivide a feature into smaller polygons
  static subdivideFeature(feature: Feature<Polygon | MultiPolygon>, count: number): Feature<Polygon | MultiPolygon>[] {
    try {
      // 1. Generate random points inside the feature
      const points = turf.randomPoint(count, { bbox: turf.bbox(feature) });
      const validPoints = points.features.filter(pt => turf.booleanPointInPolygon(pt, feature));
      
      // Ensure we have at least some points, if not, add centroid
      if (validPoints.length === 0) {
        validPoints.push(turf.point(turf.centroid(feature).geometry.coordinates));
      }
      
      // If we still have fewer than 2 points, we can't make a voronoi diagram that splits it meaningfuly 
      // (actually voronoi needs points). If count is 1, just return original.
      if (count <= 1 || validPoints.length < 2) {
        return [feature];
      }

      // 2. Generate Voronoi
      // turf.voronoi takes a FeatureCollection of points
      const voronoi = turf.voronoi(turf.featureCollection(validPoints), { bbox: turf.bbox(feature) });
      
      // 3. Intersect Voronoi cells with original polygon
      const precincts: Feature<Polygon | MultiPolygon>[] = [];
      
      voronoi.features.forEach((cell) => {
        if (!cell) return;
        // Revert: turf.intersect in this version seems to expect a FeatureCollection
        const intersection = turf.intersect(turf.featureCollection([feature, cell]));
        if (intersection) {
          precincts.push(intersection as Feature<Polygon | MultiPolygon>);
        }
      });

      return precincts.length > 0 ? precincts : [feature];
    } catch {
      // Fallback if subdivision fails
      return [feature];
    }
  }

  static async loadUSData(): Promise<{ features: Feature<Polygon | MultiPolygon>[], bounds: [number, number, number, number] }> {
    try {
      // Fetch US Atlas data (Topology)
      const topologyPromise = fetch('/data/counties-10m.json').then(r => {
        if (!r.ok) throw new Error('Failed to load topology');
        return r.json();
      });
      
      // Fetch 2020 Election Data (CSV)
      const electionPromise = fetch('/data/election_2020.csv').then(r => r.ok ? r.text() : '');

      // Fetch Demographics Data (CSV)
      const demoPromise = fetch('/data/demographics.csv').then(r => r.ok ? r.text() : '');

      // Fetch Education/Income Data (CSV)
      const eduIncPromise = fetch('/data/education_income.csv').then(r => r.ok ? r.text() : '');

      const [topology, electionCsv, demoCsv, eduIncCsv] = await Promise.all([topologyPromise, electionPromise, demoPromise, eduIncPromise]);

      // Parse Election CSV
      const electionData = new Map<number, { dem: number, rep: number }>();
      if (electionCsv) {
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
      }

      // Parse Demographics CSV
      const demoData = new Map<number, { pop: number, white: number, black: number, hispanic: number }>();
      if (demoCsv) {
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
      }

      // Parse Education/Income CSV
      const eduIncData = new Map<number, { education: number, income: number }>();
      if (eduIncCsv) {
        const eduIncLines = eduIncCsv.split('\n');
        const headers = eduIncLines[0].split(',');
        const eduIdx = headers.findIndex((h: string) => h.includes("Percent of adults with a bachelor's degree or higher"));
        const incIdx = headers.findIndex((h: string) => h.includes("Median_Household_Income_2018"));

        if (eduIdx !== -1 && incIdx !== -1) {
          for (let i = 1; i < eduIncLines.length; i++) {
            const line = eduIncLines[i].trim();
            if (!line) continue;
            const parts = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || line.split(',');
            const cleanParts = parts.map((p: string) => p.replace(/^"|"$/g, '').trim());
            
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
          
          // Get real data for the COUNTY
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
            population = Math.floor(Math.random() * 50000) + 1000;
          }

          if (vote) {
            demVotes = vote.dem;
            repVotes = vote.rep;
          } else {
            const popFactor = Math.min(population / 40000, 1);
            const demProb = 0.3 + (popFactor * 0.4);
            demVotes = Math.floor(population * 0.6 * demProb); 
            repVotes = Math.floor(population * 0.6) - demVotes;
          }
          
          if (eduInc) {
            education = eduInc.education;
            income = eduInc.income;
          } else {
            education = 20 + Math.floor(Math.random() * 20);
            income = 40000 + Math.floor(Math.random() * 40000);
          }

          const projectedFeature: Feature<Polygon | MultiPolygon> = {
            type: 'Feature',
            properties: {},
            geometry: {
              type: geometry.type as 'Polygon' | 'MultiPolygon',
              coordinates: newCoordinates
            } as Polygon | MultiPolygon
          };

          const subCount = Math.max(2, Math.min(10, Math.floor(population / 10000)));
          
          const subFeatures = DataGenerator.subdivideFeature(projectedFeature, subCount);
          
          subFeatures.forEach((subFeature, idx) => {
            const ratio = 1 / subFeatures.length;
            const noise = () => 0.9 + Math.random() * 0.2; 

            const subPop = Math.round(population * ratio * noise());
            const subDem = Math.round(demVotes * ratio * noise());
            const subRep = Math.round(repVotes * ratio * noise());
            const subWhite = Math.round(white * ratio * noise());
            const subBlack = Math.round(black * ratio * noise());
            const subHispanic = Math.round(hispanic * ratio * noise());
            const subEdu = Math.max(0, Math.min(100, education * noise()));
            const subInc = Math.max(0, income * noise());

            features.push({
              type: 'Feature',
              id: id * 100 + idx, 
              properties: {
                ...feature.properties,
                countyId: id, 
                stateId: stateId,
                population: subPop,
                demVotes: subDem,
                repVotes: subRep,
                white: subWhite,
                black: subBlack,
                hispanic: subHispanic,
                education: subEdu,
                income: subInc
              },
              geometry: subFeature.geometry
            });
          });
        }
      });

      return { features, bounds: [minX, minY, maxX, maxY] };

    } catch (e) {
      console.error("Failed to load real data, falling back to synthetic grid", e);
      
      // Fallback: Generate a simple 10x10 grid of precincts
      const features: Feature<Polygon | MultiPolygon>[] = [];
      const width = 1000;
      const height = 600;
      const cols = 20;
      const rows = 12;
      const cellW = width / cols;
      const cellH = height / rows;

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const id = y * cols + x;
          const minX = x * cellW;
          const minY = y * cellH;
          const maxX = minX + cellW;
          const maxY = minY + cellH;

          const poly = turf.polygon([[
            [minX, minY],
            [maxX, minY],
            [maxX, maxY],
            [minX, maxY],
            [minX, minY]
          ]]);

          features.push({
            type: 'Feature',
            id: id,
            properties: {
              countyId: id,
              stateId: 1,
              population: 5000 + Math.random() * 5000,
              demVotes: 2500 + Math.random() * 1000,
              repVotes: 2500 + Math.random() * 1000,
              white: 3000,
              black: 1000,
              hispanic: 1000,
              education: 30,
              income: 50000
            },
            geometry: poly.geometry
          });
        }
      }

      return { features, bounds: [0, 0, width, height] };
    }
  }
}
