import { AccessProperty, AccessResult, SceneProperty, sensorMeta, SensorType } from '@camera.ui/sdk';

import { sensorToneColor, toneColor } from '@/common/sensorDisplay.js';

import { useRelativeTime } from '../useRelativeTime.js';
import { useSensorMoments } from '../useSensorMoments.js';
import { useSensorSettings } from '../useSensorSettings.js';

import type { TileMomentRow } from '../frame/types.js';
import type { SensorMoment } from '../useSensorMoments.js';
import type { ReactiveSensor } from '@camera.ui/browser';

const DETAILS: Partial<Record<string, string[]>> = {
  [SensorType.Access]: [AccessProperty.Method, AccessProperty.User],
};

export function useEventSensor(sensor: () => ReactiveSensor<object>) {
  const { t } = useI18n();
  const { timeAgo } = useRelativeTime();
  const { send } = useSensorSettings(sensor);

  const type = sensor().type;
  const property = sensorMeta(type)!.semantics!.stateProperty;
  const { moments, loaded, active } = useSensorMoments(sensor, [property], DETAILS[type]);

  const runnable = type === SensorType.Scene;
  const last = computed(() => moments.value[0]);
  const color = computed(() => (last.value ? describe(last.value).color : undefined) ?? baseColor());

  const stateText = computed(() => {
    if (!sensor().connected.value) return t('connection.offline');
    const moment = last.value;
    if (active.value && moment) return momentText(moment);
    if (!moment) return t(`components.sensor_state.${runnable ? 'ready' : 'idle'}`);
    if (type === SensorType.Scene) return t('components.scene_control.ran', { time: timeAgo(moment.timestamp) });
    if (type === SensorType.Doorbell) return t('components.sensor_tile.last_time', { time: timeAgo(moment.timestamp) });
    return [momentText(moment), timeAgo(moment.timestamp)].join(' · ');
  });

  function describe(moment: SensorMoment): TileMomentRow {
    if (type === SensorType.Scene) return { label: t('components.sensor_tile.ran') };
    if (type === SensorType.Doorbell) return { label: t('components.sensor_tile.rang') };
    if (type !== SensorType.Access) return { label: t(`components.sensor_state.${String(moment.value)}`) };
    const method = moment.details[AccessProperty.Method];
    const user = moment.details[AccessProperty.User];
    return {
      label: t(`components.sensor_state.${String(moment.value)}`),
      detail: [user, method && t(`components.automation_nodes.access_state_${String(method)}`)].filter(Boolean).join(' · ') || undefined,
      color: toneColor(moment.value === AccessResult.Granted ? 'ok' : 'alarm'),
    };
  }

  function momentText(moment: SensorMoment): string {
    if (type === SensorType.Scene) return t('components.sensor_state.running');
    if (type === SensorType.Doorbell) return t('components.sensor_state.ringing');
    if (type !== SensorType.Access) return describe(moment).label;
    // who and how say more than the result, the color shows that already
    return describe(moment).detail ?? describe(moment).label;
  }

  function baseColor(): string {
    return sensorToneColor(type, true) ?? toneColor('info');
  }

  function run() {
    send(SceneProperty.Active, true);
  }

  return { runnable, moments, loaded, active, last, color, stateText, describe, run };
}
