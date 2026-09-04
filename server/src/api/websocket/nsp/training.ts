import { container } from 'tsyringe';

import type { Namespace, Server, Socket } from 'socket.io';
import type { TrainingCandidateManager } from '../../../manager/trainingCandidateManager.js';
import type { TrainingSubmitProgress } from '../../../manager/types.js';
import type { SocketNsp } from '../types.js';

export class TrainingNamespace {
  public nsp: Namespace;
  public nspName: SocketNsp = '/training';

  constructor(io: Server) {
    this.nsp = io.of(this.nspName);
    this.nsp.on('connection', (socket: Socket) => {
      socket.on('get-submit-progress', this.getSubmitProgress.bind(this));
    });
  }

  public getSubmitProgress(_payload: any, callback?: Function): TrainingSubmitProgress {
    let progress: TrainingSubmitProgress = { active: false, total: 0, done: 0, failed: 0 };
    try {
      progress = container.resolve<TrainingCandidateManager>('trainingCandidateManager').currentSubmitProgress();
    } catch {
      // manager not registered yet
    }
    callback?.(progress);
    return progress;
  }

  public emitCandidatesChanged(cameraId?: string): void {
    this.nsp.emit('candidates-changed', { cameraId });
  }

  public emitSubmitProgress(progress: TrainingSubmitProgress): void {
    this.nsp.emit('submit-progress', progress);
  }
}
