import { getSensorHistoryFn } from '@/api/routes/sensors.js';

import type { SensorHistoryEntry } from '@/api/routes/sensors.js';
import type { ReactiveSensor } from '@camera.ui/browser';

export interface SensorMoment {
  property: string;
  value: unknown;
  timestamp: number;
  details: Record<string, unknown>;
}

const MOMENT_LIMIT = 20;
const HISTORY_LIMIT = 200;
const DETAIL_SLACK_MS = 1_000;

export function useSensorMoments(sensor: () => ReactiveSensor<object>, properties: string[], details: string[] = []) {
  const moments = ref<SensorMoment[]>([]);
  const loaded = ref(false);

  const active = computed(() => properties.some((property) => isMoment(sensor().getProperty(property))));

  onMounted(async () => {
    const history = await getSensorHistoryFn({ id: sensor().id, limit: HISTORY_LIMIT }).catch(() => []);
    const past = history
      .filter((entry) => properties.includes(entry.property) && isMoment(entry.value))
      .sort((a, b) => b.timestamp - a.timestamp)
      .map(({ property, value, timestamp }) => ({ property, value, timestamp, details: detailsAt(history, timestamp) }));
    // what happened while the request ran comes before what the server had
    moments.value = [...moments.value, ...past].slice(0, MOMENT_LIMIT);
    loaded.value = true;
  });

  watch(
    () => properties.map((property) => sensor().getProperty(property)),
    (values, previous) => {
      const timestamp = Date.now();
      const fresh = properties
        .filter((_property, index) => values[index] !== previous[index] && isMoment(values[index]))
        .map((property) => ({ property, value: sensor().getProperty(property), timestamp, details: liveDetails() }));
      if (fresh.length > 0) moments.value = [...fresh, ...moments.value].slice(0, MOMENT_LIMIT);
    },
  );

  watch(
    () => details.map((name) => sensor().getProperty(name)),
    () => {
      const [latest, ...rest] = moments.value;
      if (latest && Date.now() - latest.timestamp < DETAIL_SLACK_MS) moments.value = [{ ...latest, details: liveDetails() }, ...rest];
    },
  );

  function liveDetails(): Record<string, unknown> {
    return Object.fromEntries(details.map((name) => [name, sensor().getProperty(name)]));
  }

  function detailsAt(history: SensorHistoryEntry[], timestamp: number): Record<string, unknown> {
    return Object.fromEntries(
      details.map((name) => {
        const before = history.filter((entry) => entry.property === name && entry.timestamp <= timestamp + DETAIL_SLACK_MS);
        return [name, before.sort((a, b) => b.timestamp - a.timestamp)[0]?.value];
      }),
    );
  }

  return { moments, loaded, active };
}

function isMoment(value: unknown): boolean {
  return value !== undefined && value !== null && value !== false && value !== '';
}
