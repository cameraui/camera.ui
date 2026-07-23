import { onlineManager } from '@tanstack/vue-query';

import type { Connection } from '@/connection/types.js';

export function bridgeConnectionToQueryOnline(connection: Connection): void {
  onlineManager.setEventListener((setOnline) =>
    watch(
      () => connection.signal.value.kind === 'online' || connection.signal.value.kind === 'degraded',
      (online) => setOnline(online),
      { immediate: true },
    ),
  );
}
