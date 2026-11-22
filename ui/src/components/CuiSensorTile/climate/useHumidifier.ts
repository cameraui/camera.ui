import { HumidifierAction, HumidifierKind, HumidifierProperty, sensorMeta } from '@camera.ui/sdk';

import { sensorOffers, toneColor } from '@/common/sensorDisplay.js';

import { fromRatio, sensorRange, snapToRange, toRatio } from '../range.js';
import { useLiveProperty } from '../useLiveProperty.js';
import { useSensorSettings } from '../useSensorSettings.js';

import type { ClimateActivity } from './types.js';
import type { ReactiveSensor } from '@camera.ui/browser';

export function useHumidifier(sensor: () => ReactiveSensor<object>) {
  const { t } = useI18n();
  const { choices, reading, propertyLabel, send } = useSensorSettings(sensor);

  const names = sensorMeta(sensor().type)!.semantics!.humidifier!;
  const target = useLiveProperty(sensor, names.target, 50);

  const on = computed(() => sensor().getProperty(HumidifierProperty.On) === true);
  const drier = computed(() => sensor().getProperty(HumidifierProperty.Kind) === HumidifierKind.Dehumidifier);
  const action = computed(() => (names.action && sensorOffers(sensor(), names.action) ? sensor().getProperty<string>(names.action) : undefined));
  const activity = computed<ClimateActivity>(() => {
    if (!on.value) return 'off';
    if (action.value === HumidifierAction.Humidifying) return 'cool';
    if (action.value === HumidifierAction.Drying) return 'heat';
    return 'idle';
  });
  const color = computed(() => {
    if (!on.value) return undefined;
    if (activity.value !== 'idle') return toneColor(activity.value === 'heat' ? 'warn' : 'info');
    return toneColor(drier.value ? 'warn' : 'info');
  });

  const range = computed(() => sensorRange(sensor(), names.target, 0, 100));
  const ratio = computed(() => toRatio(target.value.value, range.value));
  const current = computed(() => reading(names.current));
  const targetText = computed(() => percent(target.value.value));
  const modes = computed(() => (names.mode ? choices(names.mode) : []));
  const mode = computed(() => (names.mode ? sensor().getProperty<string>(names.mode) : undefined));

  const stateText = computed(() => {
    if (!sensor().connected.value) return t('connection.offline');
    if (!on.value) return t('components.sensor_state.off');
    if (activity.value === 'cool') return t('components.sensor_tile.humidifying_to', { value: targetText.value });
    if (activity.value === 'heat') return t('components.sensor_tile.drying_to', { value: targetText.value });
    return t('components.sensor_tile.keeping', { value: targetText.value });
  });

  function toggle() {
    send(HumidifierProperty.On, !on.value);
  }

  function setTarget(value: number, final: boolean) {
    const snapped = snapToRange(value, range.value);
    if (final) target.commit(snapped);
    else target.input(snapped);
  }

  function inputRatio(next: number) {
    target.input(fromRatio(next, range.value));
  }

  function commitRatio(next: number) {
    target.commit(fromRatio(next, range.value));
  }

  function setMode(value: string) {
    if (names.mode) send(names.mode, value);
  }

  function percent(value: number): string {
    return `${Math.round(value)} %`;
  }

  return {
    names,
    on,
    activity,
    color,
    range,
    ratio,
    current,
    target,
    targetText,
    modes,
    mode,
    stateText,
    toggle,
    setTarget,
    inputRatio,
    commitRatio,
    setMode,
    percent,
    propertyLabel,
  };
}
