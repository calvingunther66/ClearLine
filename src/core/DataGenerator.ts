import { polygon } from '@turf/turf';
import type { Feature, Polygon } from 'geojson';


export class DataGenerator {
  // Generate a grid of "States"
  static generateStates(rows: number, cols: number): Feature<Polygon>[] {
    const states: Feature<Polygon>[] = [];
    const width = 100;
    const height = 60;
    const cellW = width / cols;
    const cellH = height / rows;

    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const x = j * cellW;
        const y = i * cellH;
        const poly = polygon([[
          [x, y],
          [x + cellW, y],
          [x + cellW, y + cellH],
          [x, y + cellH],
          [x, y]
        ]], {
          id: i * cols + j,
          name: `State ${i * cols + j}`
        });
        states.push(poly);
      }
    }
    return states;
  }

  // Generate "Precincts" within a State
  static generatePrecincts(_stateId: number, _bounds: any, _count: number): Feature<Polygon>[] {
    // Simplified grid for now
    const precincts: Feature<Polygon>[] = [];
    // ... implementation details for subdivision
    return precincts;
  }
}
