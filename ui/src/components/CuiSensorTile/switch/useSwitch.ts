import { OutletCapability, OutletProperty, SensorType, SwitchProperty } from '@camera.ui/sdk';

import { sensorToneColor } from '@/common/sensorDisplay.js';

import { useLiveProperty } from '../useLiveProperty.js';

import type { ReactiveSensor } from '@camera.ui/browser';

export function useSwitch(sensor: () => ReactiveSensor<object>) {
  const { t } = useI18n();

  const power = useLiveProperty(sensor, SwitchProperty.On, false);

  const on = computed(() => power.value.value === true);
  const isOutlet = computed(() => sensor().type === SensorType.Outlet);
  const inUse = computed(() => on.value && sensor().hasCapability(OutletCapability.InUse) && sensor().getProperty(OutletProperty.InUse) === true);
  const color = computed(() => sensorToneColor(sensor().type, true));

  const stateText = computed(() => {
    if (!sensor().online.value) return t('connection.offline');
    if (inUse.value) return t('components.sensor_tile.in_use');
    return t(`components.sensor_state.${on.value ? 'on' : 'off'}`);
  });

  function setOn(value: boolean) {
    power.commit(value);
  }

  function toggle() {
    setOn(!on.value);
  }

  return { on, isOutlet, inUse, color, stateText, setOn, toggle };
}
