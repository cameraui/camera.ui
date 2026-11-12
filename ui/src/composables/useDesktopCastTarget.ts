import { getCameraFn } from '@/api/routes/cameras.js';

import type { CastIdentity } from '@/types/electron';

interface CastCommand {
  type: string;
  cameraId: string;
}

// the server drops a target after 75 s without presence
const PRESENCE_MS = 30_000;

const identity = shallowRef<CastIdentity>();

export function desktopCastDeviceId(): string | undefined {
  return identity.value?.deviceId;
}

export function useDesktopCastTarget(): void {
  const { isElectronApp, electron } = useElectron();
  const { rpc, isConnected } = useCameraUi();
  const { showEventPopup } = useEventPopup();

  let timer: ReturnType<typeof setInterval> | undefined;
  let unsubscribe: (() => void) | undefined;
  let generation = 0;

  function stop(): void {
    generation++;
    clearInterval(timer);
    timer = undefined;
    unsubscribe?.();
    unsubscribe = undefined;
  }

  async function onCast(command: CastCommand): Promise<void> {
    if (command?.type !== 'openPlayer' || typeof command.cameraId !== 'string') return;
    const camera = await getCameraFn({ cameraname: command.cameraId, signal: new AbortController().signal }).catch(() => undefined);
    if (!camera) return;
    showEventPopup({ id: `cast-${Date.now()}`, cameraId: camera._id, cameraName: camera.name, title: camera.name, source: 'cast' });
  }

  async function start(): Promise<void> {
    stop();
    const run = generation;
    const client = rpc.value;
    if (!isElectronApp || !electron || !client || !isConnected.value) return;

    // desktop apps before casting have no identity
    identity.value ??= await electron.invoke('get-cast-identity').catch(() => undefined);
    const own = identity.value;
    if (!own || run !== generation) return;

    const off = await client.subscribe<CastCommand>(`cast.device.${own.deviceId}`, onCast);
    if (run !== generation) {
      off();
      return;
    }
    unsubscribe = off;

    const announce = (): void => {
      client.publish('cast.presence', { deviceId: own.deviceId, name: own.name }).catch(() => {});
    };
    announce();
    timer = setInterval(announce, PRESENCE_MS);
  }

  watch(
    [rpc, isConnected],
    () => {
      start().catch(() => stop());
    },
    { immediate: true },
  );
  tryOnScopeDispose(stop);
}
