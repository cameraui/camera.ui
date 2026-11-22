import { AirPurifierProperty, AirPurifierState, FanDirection, FanProperty, sensorMeta, SensorType } from '@camera.ui/sdk';

import { sensorOffers, sensorToneColor, toneColor } from '@/common/sensorDisplay.js';

import { useLevelSwitch } from '../useLevelSwitch.js';
import { useSensorSettings } from '../useSensorSettings.js';

import type { ReactiveSensor } from '@camera.ui/browser';

const MAX_STEPS = 10;
const LOW_FILTER = 20;

export function useFan(sensor: () => ReactiveSensor<object>) {
  const { t } = useI18n();

  const semantics = sensorMeta(sensor().type)!.semantics!;
  const names = semantics.fan!;
  const {
    on,
    lit,
    hasLevel: hasSpeed,
    levelRange: speedRange,
    ratio,
    percent,
    toggle,
    inputLevel,
    commitLevel,
  } = useLevelSwitch(sensor, semantics.commandProperty!, names.speed!);
  const { toggles, flags, propertyLabel, choices, reading, send } = useSensorSettings(sensor);

  const isPurifier = computed(() => sensor().type === SensorType.AirPurifier);
  const color = computed(() => sensorToneColor(sensor().type, true));

  const steps = computed(() => {
    const { min, max, step } = speedRange.value;
    const count = Math.round((max - min) / step);
    return count <= MAX_STEPS ? count : 0;
  });
  const step = computed(() => Math.round(ratio.value * steps.value));
  const speedText = computed(() => {
    if (!hasSpeed.value) return undefined;
    return steps.value > 0 ? t('components.sensor_tile.speed_step', { step: step.value, count: steps.value }) : `${percent.value} %`;
  });

  const hasDirection = computed(() => offers(names.direction));
  const reverse = computed(() => hasDirection.value && sensor().getProperty(names.direction!) === FanDirection.Reverse);
  const hasOscillation = computed(() => offers(names.oscillating));
  const oscillating = computed(() => hasOscillation.value && sensor().getProperty(names.oscillating!) === true);

  const presets = computed(() => choices(FanProperty.Preset));
  const preset = computed(() => sensor().getProperty<string>(FanProperty.Preset));
  const presetName = computed(() => presets.value.find((option) => option.value === preset.value)?.label ?? preset.value);

  const purifierState = computed(() => (offers(AirPurifierProperty.State) ? sensor().getProperty<string>(AirPurifierProperty.State) : undefined));
  const working = computed(() => lit.value && purifierState.value !== AirPurifierState.Idle);
  const filterLife = computed(() => reading(AirPurifierProperty.FilterLife));
  const childLock = computed(() => offers(AirPurifierProperty.ChildLock) && sensor().getProperty(AirPurifierProperty.ChildLock) === true);
  const changeFilter = computed(() => offers(AirPurifierProperty.FilterChange) && sensor().getProperty(AirPurifierProperty.FilterChange) === true);
  const filterColor = computed(() => {
    if (changeFilter.value) return toneColor('alarm');
    if (filterLife.value !== undefined && filterLife.value <= LOW_FILTER) return toneColor('warn');
    return toneColor('ok');
  });

  const doing = computed(() =>
    lit.value && purifierState.value && purifierState.value !== AirPurifierState.Inactive
      ? t(`components.automation_nodes.${sensor().type}_state_${purifierState.value}`)
      : undefined,
  );
  const notes = computed(() => {
    const running = lit.value
      ? [
          doing.value,
          oscillating.value ? t('components.sensor_tile.oscillating') : undefined,
          reverse.value ? t(`components.automation_nodes.${sensor().type}_state_${FanDirection.Reverse}`) : undefined,
          ...flags.value,
          presetName.value,
        ]
      : [];
    return [...running, changeFilter.value ? t('components.sensor_state.change_filter') : undefined].filter(Boolean);
  });
  const caption = computed(() => notes.value.join(' · ') || undefined);
  const stateText = computed(() => {
    if (!sensor().connected.value) return t('connection.offline');
    const head = doing.value ? [] : [t(`components.sensor_state.${lit.value ? 'on' : 'off'}`)];
    return [...head, ...notes.value].join(' · ');
  });
  const hasMore = computed(() => hasDirection.value || hasOscillation.value || presets.value.length > 0 || toggles.value.length > 0 || filterLife.value !== undefined);

  function setStep(value: number) {
    commitLevel(value / steps.value);
  }

  function setDirection(value: FanDirection) {
    if (names.direction) send(names.direction, value);
  }

  function setOscillating(value: boolean) {
    if (names.oscillating) send(names.oscillating, value);
  }

  function offers(property: string | undefined): property is string {
    return !!property && sensorOffers(sensor(), property);
  }

  return {
    on,
    lit,
    isPurifier,
    color,
    hasSpeed,
    ratio,
    steps,
    step,
    speedText,
    hasDirection,
    reverse,
    hasOscillation,
    oscillating,
    presets,
    preset,
    toggles,
    working,
    childLock,
    filterLife,
    changeFilter,
    filterColor,
    caption,
    stateText,
    hasMore,
    toggle,
    inputLevel,
    commitLevel,
    setStep,
    setDirection,
    setOscillating,
    propertyLabel,
    send,
  };
}
