declare module 'rbush' {
  export default class RBush<T> {
    insert(item: T): void;
    search(bbox: { minX: number; minY: number; maxX: number; maxY: number }): T[];
    clear(): void;
    all(): T[];
    remove(item: T): void;
    fromJSON(data: unknown): void;
    toJSON(): unknown;
  }
}
