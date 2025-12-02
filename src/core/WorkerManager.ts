import type { WorkerMessage, WorkerResponse } from '../core/types';

export class WorkerManager {
  private workers: Worker[] = [];
  private poolSize = 4;
  private taskQueue: { message: WorkerMessage; resolve: (val: unknown) => void; reject: (err: unknown) => void }[] = [];
  // private activeWorkers = 0;
  private workerBusy: boolean[] = [];
  private pendingResponses: Map<string, { resolve: (val: unknown) => void; reject: (err: unknown) => void }> = new Map();

  constructor() {
    // Initial pool size: Cores - 2, min 1, max 12
    const cores = navigator.hardwareConcurrency || 4;
    this.poolSize = Math.max(1, Math.min(cores - 2, 12));
    this.initializePool();
  }

  private initializePool() {
    for (let i = 0; i < this.poolSize; i++) {
      this.addWorker();
    }
  }

  private addWorker() {
    const worker = new Worker(new URL('../workers/main.worker.ts', import.meta.url), { type: 'module' });
    const index = this.workers.length;
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => this.handleWorkerResponse(index, e.data);
    this.workers.push(worker);
    this.workerBusy.push(false);
  }

  private removeWorker() {
    if (this.workers.length <= 1) return; // Keep at least 1
    
    const worker = this.workers.pop();
    if (worker) {
      worker.terminate();
    }
    this.workerBusy.pop();
    this.poolSize--;
  }

  public resizePool(newSize: number) {
    if (newSize > this.workers.length) {
      const toAdd = newSize - this.workers.length;
      for (let i = 0; i < toAdd; i++) this.addWorker();
    } else if (newSize < this.workers.length) {
      const toRemove = this.workers.length - newSize;
      for (let i = 0; i < toRemove; i++) this.removeWorker();
    }
    this.poolSize = newSize;
  }

  public updateLoad(fps: number, memoryUsed: number) {
    const cores = navigator.hardwareConcurrency || 4;
    const maxWorkers = cores;
    const minWorkers = 1;

    // Simple adaptive logic
    if ((fps < 30 || memoryUsed > 500) && this.workers.length > minWorkers) {
      // High load or high memory, reduce workers
      this.resizePool(this.workers.length - 1);
      console.log(`[WorkerManager] High Load (FPS: ${fps}, Mem: ${memoryUsed}MB). Reducing workers to ${this.workers.length}`);
    } else if (fps > 55 && memoryUsed < 300 && this.workers.length < maxWorkers && this.taskQueue.length > 5) {
      // Smooth sailing but queue piling up, add workers
      this.resizePool(this.workers.length + 1);
      console.log(`[WorkerManager] Queue Full (FPS: ${fps}). Increasing workers to ${this.workers.length}`);
    }
  }

  public getWorkerCount() {
    return this.workers.length;
  }

  public async sendMessage(type: WorkerMessage['type'], payload: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const message: WorkerMessage = { id, type, payload };
      
      this.taskQueue.push({ message, resolve, reject });
      this.processQueue();
    });
  }

  private processQueue() {
    if (this.taskQueue.length === 0) return;

    const availableWorkerIndex = this.workerBusy.findIndex(busy => !busy);
    if (availableWorkerIndex === -1) return;

    const task = this.taskQueue.shift();
    if (!task) return;

    const { message, resolve, reject } = task;
    this.workerBusy[availableWorkerIndex] = true;
    this.pendingResponses.set(message.id, { resolve, reject });

    this.workers[availableWorkerIndex].postMessage(message);
  }

  private handleWorkerResponse(workerIndex: number, response: WorkerResponse) {
    this.workerBusy[workerIndex] = false;
    
    const pending = this.pendingResponses.get(response.id);
    if (pending) {
      if (response.success) {
        pending.resolve(response.data);
      } else {
        pending.reject(response.error);
      }
      this.pendingResponses.delete(response.id);
    }

    // Process next task
    this.processQueue();
  }

  public terminate() {
    this.workers.forEach(w => w.terminate());
    this.workers = [];
    this.workerBusy = [];
  }
}

export const workerManager = new WorkerManager();
