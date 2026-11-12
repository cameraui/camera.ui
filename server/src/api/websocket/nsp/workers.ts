import { inject } from '../../../container.js';
import { onClientEvent } from '../client-events.js';

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
    this.workerManager = inject('workerManager');

    this.nsp = io.of(this.nspName);
    this.nsp.on('connection', (socket: Socket) => {
      onClientEvent(socket, 'get-workers', this.getWorkers.bind(this));
      onClientEvent(socket, 'get-worker-history', this.getWorkerHistory.bind(this));
    });
  }

  public getWorkers(_payload: any, callback?: (data: WorkerInfo[]) => void): WorkerInfo[] {
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

  public handleWorkerRemoved(agentId: string): void {
    delete this.history[agentId];
  }

  private getWorkerHistory(_payload: any, callback?: (data: Record<string, WorkerInfo[]>) => void): Record<string, WorkerInfo[]> {
    callback?.(this.history);
    return this.history;
  }
}
