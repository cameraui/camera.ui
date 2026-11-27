import type { ReactiveSensor } from '@camera.ui/browser';

const WRITE_EVERY_MS = 250;

export function useLiveProperty<T>(sensor: () => ReactiveSensor<object>, property: string, fallback: T) {
  const toast = useCuiToast();

  const preview = shallowRef<T>();

  const value = computed(() => preview.value ?? sensor().getProperty<T>(property) ?? fallback);
  const pending = computed(() => preview.value !== undefined || sensor().isPending(property));

  // a failed step while dragging shows up when the drag commits
  const write = useThrottleFn(
    (next: T) =>
      sensor()
        .setProperty(property, next)
        .catch(() => {}),
    WRITE_EVERY_MS,
    true,
  );

  function input(next: T) {
    preview.value = next;
    write(next);
  }

  async function commit(next: T): Promise<boolean> {
    preview.value = undefined;
    try {
      await sensor().setProperty(property, next);
      return true;
    } catch (error) {
      toast.add({ severity: 'error', detail: error, life: 3000 });
      return false;
    }
  }

  return { value, pending, input, commit };
}
