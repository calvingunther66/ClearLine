import { DataStore } from './DataStore';
import { workerManager } from './WorkerManager';

export type BrushType = 'SINGLE' | 'DRAG' | 'COUNTY';

export class BrushManager {
  private currentBrush: BrushType = 'SINGLE';
  private currentDistrictId = 1;
  private isDragging = false;
  private dataStore: DataStore;

  constructor(dataStore: DataStore) {
    this.dataStore = dataStore;
  }

  public setBrush(type: BrushType) {
    this.currentBrush = type;
  }

  public setDistrict(id: number) {
    this.currentDistrictId = id;
  }

  public handleMouseDown(precinctId: number) {
    this.isDragging = true;
    this.applyBrush(precinctId);
  }

  public handleMouseMove(precinctId: number) {
    if (this.isDragging && this.currentBrush === 'DRAG') {
      this.applyBrush(precinctId);
    }
  }

  public handleMouseUp() {
    this.isDragging = false;
  }

  private applyBrush(precinctId: number) {
    const precinct = this.dataStore.getPrecinct(precinctId);
    if (precinct && precinct.districtId !== this.currentDistrictId) {
      // Optimistic update
      this.dataStore.updatePrecinctDistrict(precinctId, this.currentDistrictId);
      
      // Send to worker
      workerManager.sendMessage('UPDATE_DISTRICT', {
        precinctId,
        newDistrict: this.currentDistrictId
      });
    }
  }
}
