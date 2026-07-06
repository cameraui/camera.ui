import { createCameraUiPlugin } from '@camera.ui/browser';
import { createNvrPlugin } from '@camera.ui/nvr';

import { getWorkerBridge, workerRegistry } from '@/connection/instance.js';

import type { Connection } from '@/connection/types.js';
import type { App } from 'vue';

export function registerEcosystemPlugins(app: App, connection: Connection): void {
  app.use(
    createCameraUiPlugin({
      natsTransport: connection.nats,
      target: connection.target,
      wsTransport: connection.ws,
    }),
  );

  app.use(
    createNvrPlugin({
      natsTransport: connection.nats,
      target: connection.target,
      wsTransport: connection.ws,
      workerBridge: getWorkerBridge(),
      workerRegistry,
    }),
  );
}
