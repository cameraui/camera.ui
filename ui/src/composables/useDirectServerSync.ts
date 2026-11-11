import { getServerIdentityFn } from '@/api/routes/instances.js';
import { getServerEndpointsFn } from '@/api/routes/server.js';
import { getDirectServer, isCapacitor, routeNoteFor, screenTunnelAddresses, trustDirectServer, updateDirectServer } from '@/connection/index.js';

const log = useLogger('DirectServer');

export function useDirectServerSync() {
  if (!isCapacitor || !getDirectServer()) return;

  const { t } = useI18n();
  const toast = useCuiToast();
  const instanceStore = useInstanceStore();
  const { isLoggedIn } = storeToRefs(useAuthStore());

  async function sync(): Promise<void> {
    const before = getDirectServer();
    if (!before) return;

    try {
      const [endpoints, identity] = await Promise.all([getServerEndpointsFn(), getServerIdentityFn().catch(() => null)]);
      const { internalAddresses, externalAddresses } = screenTunnelAddresses(endpoints.internalAddresses, endpoints.externalAddresses);
      const routeNote = routeNoteFor(externalAddresses);

      await updateDirectServer({ name: identity?.name || before.name, internalAddresses, externalAddresses, ca: endpoints.ca ?? before.ca, routeNote });
      await trustDirectServer(getDirectServer()!);

      if (routeNote && routeNote !== before.routeNote) {
        toast.add({ severity: 'info', detail: t(routeNote === 'home-only' ? 'connection.direct_home_only' : 'connection.direct_quick_tunnel'), life: 10_000 });
      }
    } catch (err) {
      log.debug('direct server sync failed', err);
    }
  }

  watch(
    () => isLoggedIn.value && instanceStore.isHomeActive,
    (ready) => {
      if (ready) sync();
    },
    { immediate: true },
  );
}
