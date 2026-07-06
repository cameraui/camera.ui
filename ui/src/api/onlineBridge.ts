import { onlineManager } from '@tanstack/vue-query';

import type { Connection } from '@/connection/types.js';

export function bridgeConnectionToQueryOnline(connection: Connection): void {
  onlineManager.setEventListener((setOnline) =>
    watch(
      () => connection.phase.value.kind === 'online',
      (online) => setOnline(online),
      { immediate: true },
    ),
  );
}
