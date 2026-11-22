import { PTZProperty } from '@camera.ui/sdk';

import { toneColor } from '@/common/sensorDisplay.js';

import type { ReactiveSensor } from '@camera.ui/browser';

export function usePtzState(sensor: () => ReactiveSensor<object>) {
  const { t } = useI18n();

  const moving = computed(() => sensor().getProperty(PTZProperty.Moving) === true);
  const color = toneColor('info');
  const stateText = computed(() => {
    if (!sensor().connected.value) return t('connection.offline');
    return t(moving.value ? 'components.sensor_tile.moving' : 'components.sensor_state.ready');
  });

  return { moving, color, stateText };
}
