import type { ReactiveSensor } from '@camera.ui/browser';

type SensorWrite = (sensor: ReactiveSensor) => Promise<unknown>;
type LevelWrite = (sensor: ReactiveSensor, ratio: number) => Promise<unknown>;

const WRITE_EVERY_MS = 250;
const HOLD_MS = 2000;

export function useGroupSend() {
  const toast = useCuiToast();

  function send(sensors: ReactiveSensor[], write: SensorWrite) {
    Promise.allSettled(sensors.map(write)).then((results) => {
      const failed = results.find((result) => result.status === 'rejected');
      if (failed) toast.add({ severity: 'error', detail: failed.reason, life: 3000 });
    });
  }

  return { send };
}

export function useGroupLevel(targets: () => ReactiveSensor[], write: LevelWrite, finish: LevelWrite = write) {
  const { send } = useGroupSend();

  const preview = shallowRef<number>();
  let release: ReturnType<typeof setTimeout> | undefined;

  const step = useThrottleFn((ratio: number) => Promise.allSettled(targets().map((sensor) => write(sensor, ratio))), WRITE_EVERY_MS, true);

  onBeforeUnmount(() => clearTimeout(release));

  function input(ratio: number) {
    clearTimeout(release);
    preview.value = ratio;
    step(ratio);
  }

  function commit(ratio: number) {
    preview.value = ratio;
    clearTimeout(release);
    release = setTimeout(() => (preview.value = undefined), HOLD_MS);
    send(targets(), (sensor) => finish(sensor, ratio));
  }

  return { preview, input, commit };
}
