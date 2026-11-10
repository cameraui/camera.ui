import { RemoteQuery } from '@/api/routes/remote.js';
import { getBootResult, getConnection, isConnectionBooted, isLanTarget } from '@/connection/index.js';

import type { StreamConnectionPath } from '@camera.ui/browser';
import type { ComputedRef, Ref } from 'vue';

export type StreamPathInfo = 'relay' | 'relay-off';

export function useStreamPathInfo(path: Ref<StreamConnectionPath | undefined>, webrtcUnreachable: Ref<boolean>): ComputedRef<StreamPathInfo | undefined> {
  const remoteQuery = new RemoteQuery();

  const isAdmin = computed(() => hasPermission(undefined, 'admin'));
  const relayCouldHelp = computed(() => isAdmin.value && path.value === 'tunnel' && webrtcUnreachable.value && isRemoteViewer());

  const { data: relay } = remoteQuery.getRelayQuery(() => relayCouldHelp.value);

  return computed(() => {
    if (!isAdmin.value) return undefined;
    if (path.value === 'relay') return 'relay';
    if (relayCouldHelp.value && relay.value?.enabled === false) return 'relay-off';
    return undefined;
  });
}

function isRemoteViewer(): boolean {
  if (!isConnectionBooted()) return false;
  return !isLanTarget(getConnection().target.value?.endpoint, getBootResult().mode);
}
