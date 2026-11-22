import { isEqual } from '@camera.ui/common/utils';

import type { ReactiveSensor } from '@camera.ui/browser';

const WRITE_EVERY_MS = 250;
const HOLD_MS = 2000;

export function useLiveProperty<T>(sensor: () => ReactiveSensor<object>, property: string, fallback: T) {
  const toast = useCuiToast();

  const preview = shallowRef<T>();
  let release: ReturnType<typeof setTimeout> | undefined;

  const reported = computed(() => sensor().getProperty<T>(property) ?? fallback);
  const value = computed(() => preview.value ?? reported.value);

  // a failed step while dragging shows up when the drag commits
  const write = useThrottleFn(
    (next: T) =>
      sensor()
        .setProperty(property, next)
        .catch(() => {}),
    WRITE_EVERY_MS,
    true,
  );

  watch(reported, (now) => {
    if (release && isEqual(now, preview.value)) clear();
  });

  onBeforeUnmount(() => clearTimeout(release));

  function input(next: T) {
    clearTimeout(release);
    release = undefined;
    preview.value = next;
    write(next);
  }

  async function commit(next: T) {
    preview.value = next;
    clearTimeout(release);
    release = setTimeout(clear, HOLD_MS);
    try {
      await sensor().setProperty(property, next);
    } catch (error) {
      clear();
      toast.add({ severity: 'error', detail: error, life: 3000 });
    }
  }

  function clear() {
    clearTimeout(release);
    release = undefined;
    preview.value = undefined;
  }

  const pending = computed(() => preview.value !== undefined);

  return { value, pending, input, commit };
}
