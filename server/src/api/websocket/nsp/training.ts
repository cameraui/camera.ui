import { tryInject } from '../../../container.js';
import { onClientEvent } from '../client-events.js';

import type { Namespace, Server, Socket } from 'socket.io';
import type { TrainingCandidatesChanged, TrainingSubmitProgress } from '../../../manager/types.js';
import type { SocketNsp } from '../types.js';

export class TrainingNamespace {
  public nsp: Namespace;
  public nspName: SocketNsp = '/training';

  constructor(io: Server) {
    this.nsp = io.of(this.nspName);
    this.nsp.on('connection', (socket: Socket) => {
      onClientEvent(socket, 'get-submit-progress', this.getSubmitProgress.bind(this));
    });
  }

  public getSubmitProgress(_payload: any, callback?: (data: TrainingSubmitProgress) => void): TrainingSubmitProgress {
    const progress = tryInject('trainingCandidateManager')?.currentSubmitProgress() ?? { active: false, total: 0, done: 0, failed: 0 };
    callback?.(progress);
    return progress;
  }

  public emitCandidatesChanged(cameraId?: string, removed?: string[]): void {
    const payload: TrainingCandidatesChanged = { cameraId, removed };
    this.nsp.emit('candidates-changed', payload);
  }

  public emitSubmitProgress(progress: TrainingSubmitProgress): void {
    this.nsp.emit('submit-progress', progress);
  }
}
