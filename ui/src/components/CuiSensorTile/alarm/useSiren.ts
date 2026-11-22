import { SirenProperty } from '@camera.ui/sdk';

import { sensorStatus, toneColor } from '@/common/sensorDisplay.js';

import { useGuardedPress } from '../useGuardedPress.js';
import { useSensorSettings } from '../useSensorSettings.js';
import { useVolumeLevel } from '../useVolumeLevel.js';

import type { ReactiveSensor } from '@camera.ui/browser';
import type { MaybeRefOrGetter } from 'vue';

export function useSiren(sensor: () => ReactiveSensor<object>) {
  const { t } = useI18n();
  const { send, propertyLabel } = useSensorSettings(sensor);
  const { hasVolume, ratio, inputVolume, commitVolume } = useVolumeLevel(sensor, SirenProperty.Volume, 100);

  const active = computed(() => sensor().getProperty(SirenProperty.Active) === true);
  const color = toneColor('alarm');
  const stateText = computed(() => (sensor().connected.value ? sensorStatus(sensor().type, sensor(), t) : t('connection.offline')));

  function setActive(value: boolean) {
    send(SirenProperty.Active, value);
  }

  return { active, color, hasVolume, ratio, stateText, setActive, inputVolume, commitVolume, propertyLabel };
}

export function useSirenPress(target: MaybeRefOrGetter<HTMLElement | null | undefined>, siren: ReturnType<typeof useSiren>, interactive: () => boolean) {
  return useGuardedPress(target, {
    interactive,
    guarded: () => !siren.active.value,
    onGuarded: () => siren.setActive(true),
    onTap: () => siren.setActive(false),
    onToggle: () => siren.setActive(!siren.active.value),
  });
}
