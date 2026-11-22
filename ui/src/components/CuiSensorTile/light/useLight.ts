import { LightCapability, LightColorMode, LightProperty } from '@camera.ui/sdk';

import { kelvinColor, lightColorCss, WARM_WHITE_KELVIN } from '@/common/lightColor.js';

import { sensorRange } from '../range.js';
import { useLevelSwitch } from '../useLevelSwitch.js';
import { useLiveProperty } from '../useLiveProperty.js';

import type { ReactiveSensor } from '@camera.ui/browser';
import type { LightColor } from '@camera.ui/sdk';
import type { LightMode } from './types.js';

const WHITE: LightColor = { hue: 0, saturation: 0 };

export function useLight(sensor: () => ReactiveSensor<object>) {
  const { t } = useI18n();

  const {
    on,
    lit,
    hasLevel: hasBrightness,
    levelRange: brightnessRange,
    ratio: level,
    percent,
    toggle,
    inputLevel,
    commitLevel,
  } = useLevelSwitch(sensor, LightProperty.On, LightProperty.Brightness);
  const temperature = useLiveProperty(sensor, LightProperty.ColorTemperature, WARM_WHITE_KELVIN);
  const color = useLiveProperty(sensor, LightProperty.Color, WHITE);

  const hasTemperature = computed(() => sensor().hasCapability(LightCapability.ColorTemperature));
  const hasColor = computed(() => sensor().hasCapability(LightCapability.Color));
  const reportedMode = computed(() => sensor().getProperty<LightColorMode>(LightProperty.ColorMode));
  const chosenMode = shallowRef<LightColorMode>();
  const colorMode = computed(() => chosenMode.value ?? reportedMode.value);
  const showsColor = computed(() => hasColor.value && (!hasTemperature.value || colorMode.value === LightColorMode.Color));
  const mode = computed<LightMode>(() => (showsColor.value ? 'color' : 'white'));

  const temperatureRange = computed(() => {
    const range = sensorRange(sensor(), LightProperty.ColorTemperature, 2000, 6500);
    return { ...range, step: Math.max(range.step, 10) };
  });

  const lightColor = computed(() => {
    if (showsColor.value) return lightColorCss(color.value.value);
    return kelvinColor(hasTemperature.value ? temperature.value.value : WARM_WHITE_KELVIN);
  });

  const stateText = computed(() => {
    if (!sensor().connected.value) return t('connection.offline');
    return t(`components.sensor_state.${lit.value ? 'on' : 'off'}`);
  });
  const summary = computed(() => (lit.value && hasBrightness.value ? `${stateText.value} · ${percent.value} %` : stateText.value));

  watch(reportedMode, (now) => {
    if (now === chosenMode.value) chosenMode.value = undefined;
  });

  function inputTemperature(kelvin: number) {
    choose(LightColorMode.Temperature);
    temperature.input(kelvin);
  }

  function commitTemperature(kelvin: number) {
    choose(LightColorMode.Temperature);
    temperature.commit(kelvin);
  }

  function inputColor(next: LightColor) {
    choose(LightColorMode.Color);
    color.input(next);
  }

  function commitColor(next: LightColor) {
    choose(LightColorMode.Color);
    color.commit(next);
  }

  function setMode(next: LightMode) {
    // the light takes the mode from the value written last, so write the one it had
    if (next === 'color') commitColor(color.value.value);
    else commitTemperature(temperature.value.value);
  }

  function choose(next: LightColorMode) {
    chosenMode.value = next === reportedMode.value ? undefined : next;
  }

  return {
    on,
    lit,
    hasBrightness,
    hasTemperature,
    hasColor,
    showsColor,
    mode,
    brightnessRange,
    temperatureRange,
    level,
    percent,
    temperature,
    color,
    lightColor,
    stateText,
    summary,
    toggle,
    inputLevel,
    commitLevel,
    inputTemperature,
    commitTemperature,
    inputColor,
    commitColor,
    setMode,
  };
}
