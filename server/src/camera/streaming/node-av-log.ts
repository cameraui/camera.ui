import { AV_LOG_ERROR } from 'node-av/constants';
import { Log } from 'node-av/lib';

export interface NodeAvLogTarget {
  trace(...args: any[]): void;
}

let configured = false;

export function setupNodeAvLog(logger: NodeAvLogTarget): void {
  if (configured) {
    return;
  }
  configured = true;

  Log.setCallback(
    (_, message) => {
      logger.trace(`[node-av] ${message}`);
    },
    { maxLevel: AV_LOG_ERROR },
  );
}
