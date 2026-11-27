import { LightProperty, SensorType } from '@camera.ui/sdk';

import { sensorOffers, sensorToneColor } from '@/common/sensorDisplay.js';
import { fromRatio, sensorRange, toRatio } from '@/components/CuiSensorTile/range.js';

import { useGroupLevel, useGroupSend } from './groups/groupControl.js';
import { powerProperty, switchedOn } from './groups/switches.js';

import type { ReactiveSensor } from '@camera.ui/browser';

export function useLightGroup(members: () => ReactiveSensor[]) {
  const { t } = useI18n();
  const { send } = useGroupSend();

  const online = computed(() => members().filter((member) => member.online.value));
  const lit = computed(() => online.value.filter(switchedOn));
  const dimmable = computed(() => online.value.filter(dims));
  const hasBrightness = computed(() => dimmable.value.length > 0);
  const color = computed(() => sensorToneColor(SensorType.Light, true));

  const {
    preview,
    input: inputLevel,
    commit: commitLevel,
  } = useGroupLevel(
    targets,
    (light, ratio) => light.setProperty(LightProperty.Brightness, brightnessAt(light, ratio)),
    async (light, ratio) => {
      const wantsOn = ratio > 0;
      await light.setProperty(LightProperty.Brightness, brightnessAt(light, ratio));
      if (switchedOn(light) !== wantsOn) await light.setProperty(LightProperty.On, wantsOn);
    },
  );

  const dimmed = computed(() => (preview.value === undefined ? dimmable.value.some(switchedOn) : preview.value > 0));
  const anyOn = computed(() => dimmed.value || lit.value.some((member) => !dims(member)));
  const level = computed(() => preview.value ?? averageLevel(dimmable.value.filter(switchedOn)));
  const percent = computed(() => Math.round(level.value * 100));

  const stateText = computed(() => {
    if (!online.value.length) return t('connection.offline');
    if (!lit.value.length) return t('views.home_dashboard.lights_off');
    return t('views.home_dashboard.lights_on', { on: lit.value.length, total: members().length });
  });

  function toggle() {
    const turnOn = !lit.value.length;
    send(turnOn ? online.value : lit.value, (member) => member.setProperty(powerProperty(member), turnOn));
  }

  function targets(): ReactiveSensor[] {
    const on = dimmable.value.filter(switchedOn);
    return on.length ? on : dimmable.value;
  }

  return { anyOn, dimmed, hasBrightness, level, percent, color, stateText, toggle, inputLevel, commitLevel };
}

function dims(member: ReactiveSensor): boolean {
  return sensorOffers(member, LightProperty.Brightness);
}

function brightnessAt(light: ReactiveSensor, ratio: number): number {
  return fromRatio(ratio, sensorRange(light, LightProperty.Brightness, 0, 100));
}

function averageLevel(lights: ReactiveSensor[]): number {
  if (!lights.length) return 0;
  const sum = lights.reduce(
    (total, light) => total + toRatio(light.getProperty<number>(LightProperty.Brightness) ?? 100, sensorRange(light, LightProperty.Brightness, 0, 100)),
    0,
  );
  return sum / lights.length;
}
