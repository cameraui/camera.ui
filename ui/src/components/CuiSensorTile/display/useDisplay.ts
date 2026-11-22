import { DisplayProperty } from '@camera.ui/sdk';

import { sensorOffers, sensorPropertySpec, sensorToneColor, toneColor } from '@/common/sensorDisplay.js';

import { useLiveProperty } from '../useLiveProperty.js';
import { useSensorSettings } from '../useSensorSettings.js';

import type { ReactiveSensor } from '@camera.ui/browser';

export function useDisplay(sensor: () => ReactiveSensor<object>) {
  const { t } = useI18n();
  const { choices, propertyLabel, send } = useSensorSettings(sensor);
  const duration = useLiveProperty(sensor, DisplayProperty.Duration, 0);

  const color = computed(() => sensorToneColor(sensor().type, true) ?? toneColor('info'));
  const message = computed(() => sensor().getProperty<string>(DisplayProperty.Message) ?? '');
  const preset = computed(() => sensor().getProperty<string>(DisplayProperty.Preset) ?? '');
  const presets = computed(() => (sensorOffers(sensor(), DisplayProperty.Preset) ? choices(DisplayProperty.Preset) : []));
  const shown = computed(() => message.value || presets.value.find((option) => option.value === preset.value)?.label || preset.value);
  const hasDuration = computed(() => sensorOffers(sensor(), DisplayProperty.Duration));
  const maxDuration = computed(() => sensorPropertySpec(sensor(), DisplayProperty.Duration)?.max ?? Infinity);
  const maxLength = computed(() => sensorPropertySpec(sensor(), DisplayProperty.Message)?.maxLength);

  const stateText = computed(() => {
    if (!sensor().connected.value) return t('connection.offline');
    return shown.value || t('components.sensor_state.empty');
  });

  function show(text: string) {
    send(DisplayProperty.Message, text);
  }

  function showPreset(value: string) {
    send(DisplayProperty.Preset, value);
  }

  function clear() {
    if (message.value) send(DisplayProperty.Message, '');
    else send(DisplayProperty.Preset, '');
  }

  function setDuration(seconds: number) {
    duration.commit(seconds);
  }

  return { color, preset, presets, shown, hasDuration, duration, maxDuration, maxLength, stateText, show, showPreset, clear, setDuration, propertyLabel };
}
