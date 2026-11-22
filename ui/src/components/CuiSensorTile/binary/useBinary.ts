import { ContactProperty, sensorMeta, SensorType } from '@camera.ui/sdk';

import { sensorStateKey, sensorStatus, sensorToneColor, toneColor } from '@/common/sensorDisplay.js';

import { BINARY_GROUPS } from './groups.js';

import type { ReactiveSensor } from '@camera.ui/browser';

const GENERIC_CALM = 'components.sensor_state.clear';

export function useBinary(sensor: () => ReactiveSensor<object>) {
  const { t } = useI18n();

  const type = sensor().type;
  const property = sensorMeta(type)!.semantics!.stateProperty;
  const group = BINARY_GROUPS[type] ?? 'alarm';
  const alarm = group === 'alarm' || group === 'leak';

  const active = computed(() => sensor().getProperty(property) === true);
  const color = computed(() => sensorToneColor(type, true) ?? toneColor('warn'));
  const kind = computed(() => (type === SensorType.Contact ? sensor().getProperty<string>(ContactProperty.Kind) : undefined));

  const stateText = computed(() => {
    if (!sensor().connected.value) return t('connection.offline');
    // "inactive" reads oddly on a calm alarm, "all clear" says what it means
    if (alarm && !active.value && sensorStateKey(type, false) === GENERIC_CALM) return t('components.sensor_tile.all_clear');
    return sensorStatus(type, sensor(), t);
  });
  const headline = computed(() => {
    if (!sensor().connected.value) return t('connection.offline');
    return kind.value ? t(`components.camera_options.sensor_kind_${kind.value}`) : t(`components.camera_options.sensor_type_${type}`);
  });

  return { property, group, alarm, active, color, kind, stateText, headline };
}
