import type { ReactiveSensor, WriteFallbackReason } from '@camera.ui/browser';
import type { TileWait } from './types.js';

const SHOW_AFTER_MS = 400;
const NOTE_MS = 2_500;
const FLASH_MS = 700;

export function useTileWait(sensor: () => ReactiveSensor<object> | undefined): TileWait {
  const { t } = useI18n();

  const dragging = ref(false);
  const waiting = ref(false);
  const reason = refAutoReset<WriteFallbackReason | undefined>(undefined, NOTE_MS);
  const flashing = refAutoReset(false, FLASH_MS);

  const online = computed(() => sensor()?.online.value === true);
  const writing = computed(() => online.value && !!sensor()?.isPending());
  const { start, stop } = useTimeoutFn(
    () => {
      waiting.value = true;
    },
    SHOW_AFTER_MS,
    { immediate: false },
  );

  watch(
    () => writing.value && !dragging.value,
    (now) => {
      stop();
      waiting.value = false;
      if (now) start();
    },
    { immediate: true },
  );

  watch(writing, (now) => {
    if (now) reason.value = undefined;
  });

  watch(
    sensor,
    (current, _previous, onCleanup) => {
      if (!current) return;
      onCleanup(
        current.onWriteFallback((_property, fallback) => {
          if (dragging.value) return;
          reason.value = fallback;
          flashing.value = true;
        }),
      );
    },
    { immediate: true },
  );

  const note = computed(() => (online.value && reason.value ? t(`components.sensor_tile.write_${reason.value}`) : undefined));
  const failed = computed(() => online.value && flashing.value);

  return { waiting, failed, note, dragging };
}
