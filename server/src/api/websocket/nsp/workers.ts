import { container } from 'tsyringe';

import type { Namespace, Server, Socket } from 'socket.io';
import type { WorkerManager } from '../../../workers/manager.js';
import type { WorkerInfo } from '../../../workers/types.js';
import type { SocketNsp } from '../types.js';

export class WorkersNamespace {
  public nsp: Namespace;
  public nspName: SocketNsp = '/workers';

  private workerManager: WorkerManager;

  private readonly MAX_HISTORY_POINTS = 60;

  private history: Record<string, WorkerInfo[]> = {};

  constructor(io: Server) {
    this.workerManager = container.resolve<WorkerManager>('workerManager');

    this.nsp = io.of(this.nspName);
    this.nsp.on('connection', (socket: Socket) => {
      socket.on('get-workers', this.getWorkers.bind(this));
      socket.on('get-worker-history', this.getWorkerHistory.bind(this));
    });
  }

  public getWorkers(_payload: any, callback?: Function): WorkerInfo[] {
    const workers = this.workerManager.getWorkers();
    callback?.(workers);
    return workers;
  }

  public handleWorkerUpdate(worker: WorkerInfo): void {
    if (!this.history[worker.agentId]) {
      this.history[worker.agentId] = [];
    }
    this.history[worker.agentId].push({ ...worker });
    this.history[worker.agentId] = this.history[worker.agentId].slice(-this.MAX_HISTORY_POINTS);
  }

  private getWorkerHistory(_payload: any, callback?: Function): Record<string, WorkerInfo[]> {
    callback?.(this.history);
    return this.history;
  }
}
