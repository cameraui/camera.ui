import { createCameraUiPlugin } from '@camera.ui/browser';
import { createNvrPlugin } from '@camera.ui/nvr';

import { getIceServers } from '@/api/routes/remote.js';
import { getConnection, getWorkerBridge, workerRegistry } from '@/connection/instance.js';

import type { Connection } from '@/connection/types.js';
import type { App } from 'vue';

const iceServers = shallowRef<RTCIceServer[]>();

export async function refreshIceServers(): Promise<void> {
  const url = getConnection().target.value?.endpoint.url;
  try {
    const servers = await getIceServers();
    if (getConnection().target.value?.endpoint.url === url) iceServers.value = servers;
  } catch {}
}

export function registerEcosystemPlugins(app: App, connection: Connection): void {
  const authStore = useAuthStore();

  watch(
    [() => connection.target.value?.endpoint.url, () => connection.signal.value.kind, () => authStore.isLoggedIn && !authStore.mustSetPassword],
    ([url, kind, signedIn]) => {
      if (!url) iceServers.value = undefined;
      else if (kind === 'online' && signedIn) refreshIceServers();
    },
    { immediate: true },
  );

  app.use(
    createCameraUiPlugin({
      natsTransport: connection.nats,
      bulkTransport: connection.natsBulk,
      target: connection.target,
      wsTransport: connection.ws,
      iceServers,
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
