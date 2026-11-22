import { getSensorHistoryFn } from '@/api/routes/sensors.js';

import type { SensorHistoryEntry } from '@/api/routes/sensors.js';
import type { ReactiveSensor } from '@camera.ui/browser';

export const DAY = 24 * 3_600_000;

export function useSensorHistory(sensor: () => ReactiveSensor<object>, property: () => string) {
  const { t, locale } = useI18n();

  const entries = ref<SensorHistoryEntry[]>([]);
  const loaded = ref(false);
  const now = ref(Date.now());

  onMounted(async () => {
    const history = await getSensorHistoryFn({ id: sensor().id, limit: 500 }).catch(() => []);
    // what changed while the request ran comes after what the server had
    entries.value = [...history.filter((entry) => entry.property === property()).sort((a, b) => a.timestamp - b.timestamp), ...entries.value];
    loaded.value = true;
  });

  watch(
    () => sensor().getProperty(property()),
    (value) => {
      now.value = Date.now();
      entries.value = [...entries.value, { property: property(), value, timestamp: now.value }];
    },
  );

  // the oldest entry of the run that ends in the current value
  const since = computed(() => {
    const list = entries.value;
    let index = list.length - 1;
    if (index < 0) return undefined;
    while (index > 0 && list[index - 1].value === list[index].value) index--;
    return list[index].timestamp;
  });

  const sinceText = computed(() =>
    since.value === undefined ? undefined : t('components.sensor_tile.since', { time: shortMoment(since.value, now.value, locale.value) }),
  );

  return { entries, loaded, now, since, sinceText };
}

export function shortMoment(time: number, now: number, locale: string): string {
  const sameDay = new Date(time).toDateString() === new Date(now).toDateString();
  const recent = now - time < 6 * DAY;
  const day = sameDay ? {} : recent ? { weekday: 'short' as const } : { day: 'numeric' as const, month: 'short' as const };
  return new Intl.DateTimeFormat(locale, { ...day, hour: '2-digit', minute: '2-digit' }).format(time);
}
