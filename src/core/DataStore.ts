import { SpatialIndex } from './SpatialIndex';
import type { PrecinctStats } from './types';

export interface PrecinctData {
  id: number;
  coords: Float32Array;
  stats: Int32Array; // [Pop, Dem, Rep, White, Black, Hispanic, Education, Income]
  districtId: number;
  stateId: number;
  countyId?: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  projectedDemVotes?: number;
  projectedRepVotes?: number;
  history?: PrecinctStats[];
}

export class DataStore {
  private precincts: Map<number, PrecinctData> = new Map();
  private districtStats: Map<number, Uint16Array> = new Map();
  private spatialIndex: SpatialIndex = new SpatialIndex();

  constructor() {
    // Initialize with empty state
  }

  public addPrecinct(id: number, coords: Float32Array, stats: Int32Array, districtId: number, stateId: number, countyId?: number, history: PrecinctStats[] = []) {
    // Calculate bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < coords.length; i += 2) {
      const x = coords[i];
      const y = coords[i+1];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }

    const precinct: PrecinctData = {
      id,
      coords,
      stats,
      districtId,
      stateId,
      countyId,
      bounds: { minX, minY, maxX, maxY },
      history
    };
    this.precincts.set(id, precinct);
    
    this.spatialIndex.insert(id, minX, minY, maxX, maxY);
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
