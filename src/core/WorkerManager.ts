import type { WorkerMessage, WorkerResponse } from '../core/types';

export class WorkerManager {
  private workers: Worker[] = [];
  private poolSize = 4;
  private taskQueue: { message: WorkerMessage; resolve: (val: unknown) => void; reject: (err: unknown) => void }[] = [];
  // private activeWorkers = 0;
  private workerBusy: boolean[] = [];
  private pendingResponses: Map<string, { resolve: (val: unknown) => void; reject: (err: unknown) => void }> = new Map();

  constructor() {
    this.initializePool();
  }

  private initializePool() {
    for (let i = 0; i < this.poolSize; i++) {
      const worker = new Worker(new URL('../workers/main.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<WorkerResponse>) => this.handleWorkerResponse(i, e.data);
      this.workers.push(worker);
      this.workerBusy.push(false);
    }
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
  }
}

export const workerManager = new WorkerManager();
