import { sensorOffers } from '@/common/sensorDisplay.js';

import { fromRatio, sensorRange, toRatio } from './range.js';
import { useLiveProperty } from './useLiveProperty.js';
import { useSensorSettings } from './useSensorSettings.js';

import type { ReactiveSensor } from '@camera.ui/browser';

export function useLevelSwitch(sensor: () => ReactiveSensor<object>, onProperty: string, levelProperty: string) {
  const { send } = useSensorSettings(sensor);

  const level = useLiveProperty(sensor, levelProperty, 100);

  const on = computed(() => sensor().getProperty(onProperty) === true);
  const hasLevel = computed(() => sensorOffers(sensor(), levelProperty));
  const levelRange = computed(() => sensorRange(sensor(), levelProperty, 0, 100));
  const lit = computed(() => (level.pending.value ? level.value.value > levelRange.value.min : on.value));
  const ratio = computed(() => (hasLevel.value ? toRatio(level.value.value, levelRange.value) : 1));
  const percent = computed(() => Math.round(ratio.value * 100));

  let restore: number | undefined;

  function toggle() {
    // a device turned down to 0 comes back at the level it had before
    if (!lit.value && hasLevel.value && level.value.value <= levelRange.value.min) {
      commitLevel(toRatio(restore ?? levelRange.value.max, levelRange.value));
      return;
    }
    send(onProperty, !lit.value);
  }

  function inputLevel(next: number) {
    if (!level.pending.value) remember();
    level.input(fromRatio(next, levelRange.value));
  }

  async function commitLevel(next: number) {
    if (!level.pending.value) remember();
    const value = fromRatio(next, levelRange.value);
    const wantsOn = value > levelRange.value.min;
    // plugins differ in whether a level turns the device on, so say it
    if ((await level.commit(value)) && wantsOn !== on.value) send(onProperty, wantsOn);
  }

  function remember() {
    if (lit.value && level.value.value > levelRange.value.min) restore = level.value.value;
  }

  return { on, lit, hasLevel, levelRange, ratio, percent, toggle, inputLevel, commitLevel };
}
