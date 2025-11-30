import RBush from 'rbush';
import type { BBox } from 'geojson';

export interface SpatialItem {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  id: number;
}

export class SpatialIndex {
  private tree: RBush<SpatialItem>;

  constructor() {
    this.tree = new RBush();
  }

  public insert(id: number, bbox: BBox) {
    const item: SpatialItem = {
      minX: bbox[0],
      minY: bbox[1],
      maxX: bbox[2],
      maxY: bbox[3],
      id
    };
    this.tree.insert(item);
  }

  public search(bbox: BBox): number[] {
    const result = this.tree.search({
      minX: bbox[0],
      minY: bbox[1],
      maxX: bbox[2],
      maxY: bbox[3]
    });
    return result.map(item => item.id);
  }

  public clear() {
    this.tree.clear();
  }
}

export const spatialIndex = new SpatialIndex();
