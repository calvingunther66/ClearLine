import type { PrecinctData } from './types';
import { spatialIndex } from './SpatialIndex';

export class DataStore {
  private precincts: Map<number, PrecinctData> = new Map();
  private districtStats: Map<number, Uint16Array> = new Map();

  constructor() {
    // Initialize with empty state
  }

  public addPrecinct(id: number, coords: Float32Array, stats: Uint16Array, districtId: number) {
    const precinct: PrecinctData = {
      id,
      coords,
      stats,
      districtId
    };
    this.precincts.set(id, precinct);

    // Calculate bbox
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < coords.length; i += 2) {
      const x = coords[i];
      const y = coords[i+1];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    
    spatialIndex.insert(id, [minX, minY, maxX, maxY]);
  }

  public getPrecinct(id: number): PrecinctData | undefined {
    return this.precincts.get(id);
  }

  public getAllPrecincts(): IterableIterator<PrecinctData> {
    return this.precincts.values();
  }

  public updatePrecinctDistrict(id: number, newDistrictId: number) {
    const precinct = this.precincts.get(id);
    if (precinct) {
      precinct.districtId = newDistrictId;
      // Trigger stats update logic here (likely via Worker)
    }
  }

  public clear() {
    this.precincts.clear();
    this.districtStats.clear();
  }
}

export const dataStore = new DataStore();
