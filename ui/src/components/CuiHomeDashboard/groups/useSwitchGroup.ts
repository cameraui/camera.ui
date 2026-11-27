import { SensorType } from '@camera.ui/sdk';

import { sensorToneColor } from '@/common/sensorDisplay.js';

import { useGroupSend } from './groupControl.js';
import { drawsPower, powerProperty, switchedOn } from './switches.js';

import type { ReactiveSensor } from '@camera.ui/browser';

export function useSwitchGroup(members: () => ReactiveSensor[]) {
  const { t } = useI18n();
  const { send } = useGroupSend();

  const online = computed(() => members().filter((member) => member.online.value));
  const on = computed(() => online.value.filter(switchedOn));
  const inUse = computed(() => on.value.filter(drawsPower).length);
  const anyOn = computed(() => on.value.length > 0);
  const color = sensorToneColor(SensorType.Switch, true);

  const stateText = computed(() => {
    if (!online.value.length) return t('connection.offline');
    if (!anyOn.value) return t('views.home_dashboard.groups.switches.off');
    return t('views.home_dashboard.groups.switches.on', { on: on.value.length, total: members().length });
  });

  function toggle() {
    const turnOn = !anyOn.value;
    send(turnOn ? online.value : on.value, (member) => member.setProperty(powerProperty(member), turnOn));
  }

  return { on, inUse, anyOn, color, stateText, toggle };
}
