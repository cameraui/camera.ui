import { getSensorHistoryFn } from '@/api/routes/sensors.js';

import type { ReactiveSensor } from '@camera.ui/browser';

interface SinceOptions {
  property: (sensor: ReactiveSensor) => string;
  stateOf?: (sensor: ReactiveSensor, value: unknown) => unknown;
  tracks?: (state: unknown) => boolean;
}

const HISTORY_LIMIT = 50;

export function useSince(sensors: () => ReactiveSensor[], { property, stateOf = (_sensor, value) => value, tracks = () => true }: SinceOptions) {
  const since = reactive(new Map<string, number>());
  const asked = new Set<string>();

  watch(
    () => sensors().map((sensor) => [sensor, stateOf(sensor, sensor.getProperty(property(sensor)))] as const),
    (states, before) => {
      const was = new Map(before?.map(([sensor, state]) => [sensor.id, state]));
      for (const [sensor, state] of states) {
        if (!tracks(state)) since.delete(sensor.id);
        else if (was.has(sensor.id) && was.get(sensor.id) !== state) since.set(sensor.id, Date.now());
        else if (!since.has(sensor.id)) lookUp(sensor, state);
      }
    },
    { immediate: true },
  );

  async function lookUp(sensor: ReactiveSensor, state: unknown) {
    if (asked.has(sensor.id)) return;
    asked.add(sensor.id);
    const history = await getSensorHistoryFn({ id: sensor.id, limit: HISTORY_LIMIT }).catch(() => []);
    const states = history
      .filter((entry) => entry.property === property(sensor))
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((entry) => ({ at: entry.timestamp, state: stateOf(sensor, entry.value) }));
    let first = states.length - 1;
    if (first < 0 || states[first].state !== state) return;
    while (first > 0 && states[first - 1].state === state) first--;
    // a change that came in while the request ran is newer than the server's answer
    if (!since.has(sensor.id)) since.set(sensor.id, states[first].at);
  }

  return since;
}
