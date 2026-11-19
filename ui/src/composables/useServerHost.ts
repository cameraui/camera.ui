import { ServerQuery } from '@/api/routes/server.js';

export function useServerHost() {
  const { data: serverInfo } = new ServerQuery().getServerInfoQuery();
  return computed(() => serverInfo.value?.serverAddresses?.[0] ?? window.location.hostname);
}
