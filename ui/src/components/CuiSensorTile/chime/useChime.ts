import { ChimeProperty } from '@camera.ui/sdk';

import { sensorOffers, sensorToneColor, toneColor } from '@/common/sensorDisplay.js';

import { sensorRange } from '../range.js';
import { useLiveProperty } from '../useLiveProperty.js';
import { useSensorSettings } from '../useSensorSettings.js';
import { useVolumeLevel } from '../useVolumeLevel.js';

import type { ReactiveSensor } from '@camera.ui/browser';

export function useChime(sensor: () => ReactiveSensor<object>) {
  const { t } = useI18n();
  const { choices, propertyLabel, send } = useSensorSettings(sensor);
  const { hasVolume, ratio, percent, inputVolume, commitVolume } = useVolumeLevel(sensor, ChimeProperty.Volume, 100);
  const repeat = useLiveProperty(sensor, ChimeProperty.Repeat, 1);

  const active = computed(() => sensor().getProperty(ChimeProperty.Active) === true);
  const color = computed(() => sensorToneColor(sensor().type, true) ?? toneColor('info'));
  const tones = computed(() => choices(ChimeProperty.Tone));
  const tone = computed(() => sensor().getProperty<string>(ChimeProperty.Tone));
  const toneLabel = computed(() => tones.value.find((option) => option.value === tone.value)?.label ?? tone.value);
  const hasRepeat = computed(() => sensorOffers(sensor(), ChimeProperty.Repeat));
  const repeatRange = computed(() => sensorRange(sensor(), ChimeProperty.Repeat, 1, 10));

  const stateText = computed(() => {
    if (!sensor().connected.value) return t('connection.offline');
    if (active.value) return t('components.sensor_tile.playing');
    return toneLabel.value || t('components.sensor_state.ready');
  });

  function toggle() {
    send(ChimeProperty.Active, !active.value);
  }

  function setTone(value: string) {
    send(ChimeProperty.Tone, value);
  }

  function setRepeat(value: number) {
    repeat.commit(value);
  }

  return {
    active,
    color,
    tones,
    tone,
    hasVolume,
    ratio,
    percent,
    hasRepeat,
    repeat,
    repeatRange,
    stateText,
    toggle,
    setTone,
    setRepeat,
    inputVolume,
    commitVolume,
    propertyLabel,
  };
}
