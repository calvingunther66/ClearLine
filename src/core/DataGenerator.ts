import * as topojson from 'topojson-client';
import { geoAlbersUsa } from 'd3-geo';
import * as turf from '@turf/turf';
import type { Feature, Polygon, MultiPolygon, FeatureCollection, Geometry } from 'geojson';

interface ProcessedCountyData {
  fips: string;
  state: string;
  county: string;
  votes_gop: number;
  votes_dem: number;
  total_votes: number;
  diff: number;
  per_gop: number;
  per_dem: number;
  per_point_diff: number;
  population: number;
  white_pop: number;
  black_pop: number;
  hispanic_pop: number;
  bachelors_degree_count: number;
  bachelors_degree_pct: number;
  median_income: number;
  unemployment_rate: number;
  white_pct: number;
  black_pct: number;
  hispanic_pct: number;
}

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

  // Stream features to avoid holding everything in memory
  static async *loadUSDataGenerator(): AsyncGenerator<{ features: Feature<Polygon | MultiPolygon>[], bounds: [number, number, number, number] }> {
    try {
      // Fetch US Atlas data (Topology)
      const topologyPromise = fetch('/data/counties-10m.json').then(r => {
        if (!r.ok) throw new Error('Failed to load topology');
        return r.json();
      });
      
      // Fetch Processed Data (JSON)
      const dataPromise = fetch('/data/processed_data.json').then(r => {
        if (!r.ok) throw new Error('Failed to load processed data');
        return r.json();
      });

      const [topology, processedData] = await Promise.all([topologyPromise, dataPromise]);

      // Create a map for fast lookup
      const dataMap = new Map<number, ProcessedCountyData>();
      (processedData as ProcessedCountyData[]).forEach((d) => {
        const fips = parseInt(d.fips, 10);
        if (!isNaN(fips)) {
          dataMap.set(fips, d);
        }
      });

      // Convert to GeoJSON
      const geojson = topojson.feature(topology, topology.objects.counties) as unknown as FeatureCollection<Geometry>;
      
      // Setup Projection (Albers USA)
      const width = 1000;
      const height = 600;
      const projection = geoAlbersUsa().scale(1300).translate([width / 2, height / 2]);

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

      // Process features in chunks
      const CHUNK_SIZE = 50; 
      let chunk: Feature<Polygon | MultiPolygon>[] = [];

      for (const feature of geojson.features) {
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
          const data = dataMap.get(id);
          
          let population = 0, demVotes = 0, repVotes = 0;
          let white = 0, black = 0, hispanic = 0;
          let education = 0, income = 0;

          if (data) {
            population = data.population || 0;
            demVotes = data.votes_dem || 0;
            repVotes = data.votes_gop || 0;
            white = data.white_pop || 0;
            black = data.black_pop || 0;
            hispanic = data.hispanic_pop || 0;
            education = data.bachelors_degree_pct || 0;
            income = data.median_income || 0;
          } else {
            // Fallback for missing data (should be rare with real data)
            population = 1000;
            demVotes = 500;
            repVotes = 500;
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
            // Add some noise to make it look less uniform
            const noise = () => 0.9 + Math.random() * 0.2; 

            const subPop = Math.round(population * ratio * noise());
            const subDem = Math.round(demVotes * ratio * noise());
            const subRep = Math.round(repVotes * ratio * noise());
            const subWhite = Math.round(white * ratio * noise());
            const subBlack = Math.round(black * ratio * noise());
            const subHispanic = Math.round(hispanic * ratio * noise());
            const subEdu = Math.max(0, Math.min(100, education * noise()));
            const subInc = Math.max(0, income * noise());

            chunk.push({
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

        if (chunk.length >= CHUNK_SIZE) {
          yield { features: chunk, bounds: [minX, minY, maxX, maxY] };
          chunk = [];
          // Yield to event loop to allow GC
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }

      // Yield remaining
      if (chunk.length > 0) {
        yield { features: chunk, bounds: [minX, minY, maxX, maxY] };
      }

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
              demVotes: 2500 + Math.random() * 2000 - 1000, // 1500-3500
              repVotes: 2500 + Math.random() * 2000 - 1000, // 1500-3500
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

      yield { features, bounds: [0, 0, width, height] };
    }
  }
}
