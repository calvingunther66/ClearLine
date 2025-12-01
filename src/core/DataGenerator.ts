import * as topojson from 'topojson-client';
import { geoAlbersUsa } from 'd3-geo';
import type { Feature, Polygon, MultiPolygon, FeatureCollection, Geometry } from 'geojson';

export class DataGenerator {
  static async loadUSData(): Promise<{ features: Feature<Polygon | MultiPolygon>[], bounds: [number, number, number, number] }> {
    // Fetch US Atlas data (Topology)
    const response = await fetch('https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json');
    const topology = await response.json();

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
        features.push({
          type: 'Feature',
          id: Number(feature.id), // FIPS code
          properties: {
            ...feature.properties,
            // Generate synthetic population based on FIPS or random
            population: Math.floor(Math.random() * 50000) + 1000
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
