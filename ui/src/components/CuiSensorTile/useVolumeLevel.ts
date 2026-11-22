import { sensorOffers } from '@/common/sensorDisplay.js';

import { fromRatio, sensorRange, toRatio } from './range.js';
import { useLiveProperty } from './useLiveProperty.js';

import type { ReactiveSensor } from '@camera.ui/browser';

export function useVolumeLevel(sensor: () => ReactiveSensor<object>, property: string, fallback = 0) {
  const volume = useLiveProperty(sensor, property, fallback);

  const hasVolume = computed(() => sensorOffers(sensor(), property));
  const range = computed(() => sensorRange(sensor(), property, 0, 100));
  const ratio = computed(() => toRatio(volume.value.value, range.value));
  const percent = computed(() => Math.round(ratio.value * 100));

  function inputVolume(next: number) {
    volume.input(fromRatio(next, range.value));
  }

  function commitVolume(next: number) {
    volume.commit(fromRatio(next, range.value));
  }

  return { hasVolume, ratio, percent, inputVolume, commitVolume };
}
