import { SecuritySystemProperty, SecuritySystemState, sensorMeta } from '@camera.ui/sdk';

import { securityColor, sensorPropertySpec, sensorStatus } from '@/common/sensorDisplay.js';

import { useGuardedPress } from '../useGuardedPress.js';
import { useSensorSettings } from '../useSensorSettings.js';

import type { ReactiveSensor } from '@camera.ui/browser';
import type { MaybeRefOrGetter } from 'vue';

const ARMED = new Set<unknown>([SecuritySystemState.StayArm, SecuritySystemState.AwayArm, SecuritySystemState.NightArm]);

export function useSecuritySystem(sensor: () => ReactiveSensor<object>) {
  const { t } = useI18n();
  const { send } = useSensorSettings(sensor);

  const type = sensor().type;
  const states = sensorMeta(type)!.semantics!.states!;

  const current = computed(() => sensor().getProperty<number>(SecuritySystemProperty.CurrentState));
  const target = computed(() => sensor().getProperty<number>(SecuritySystemProperty.TargetState) ?? current.value);
  const triggered = computed(() => current.value === SecuritySystemState.AlarmTriggered);
  const wantsArmed = computed(() => ARMED.has(target.value));
  const pending = computed(() => !triggered.value && current.value !== undefined && target.value !== current.value);
  const guarded = computed(() => wantsArmed.value || triggered.value);

  const modes = computed(() => Object.values(sensorPropertySpec(sensor(), SecuritySystemProperty.TargetState)?.values ?? {}).map(Number));
  const armModes = computed(() => modes.value.filter((mode) => ARMED.has(mode)));

  const color = computed(() => securityColor(triggered.value ? SecuritySystemState.AlarmTriggered : target.value));
  const calm = computed(() => securityColor(target.value) ?? 'var(--text-secondary-color)');

  const stateText = computed(() => {
    if (!sensor().connected.value) return t('connection.offline');
    if (pending.value) return t(`components.sensor_tile.${wantsArmed.value ? 'arming' : 'disarming'}`);
    return sensorStatus(type, sensor(), t);
  });

  let lastMode: number | undefined;

  watch(
    target,
    (now) => {
      if (ARMED.has(now)) lastMode = now;
    },
    { immediate: true },
  );

  function modeLabel(mode: number): string {
    const name = Object.entries(states).find(([, value]) => value === mode)?.[0];
    return name ? t(`components.sensor_state.${name}`) : String(mode);
  }

  function arm(mode = lastMode ?? defaultMode()) {
    if (mode !== undefined) send(SecuritySystemProperty.TargetState, mode);
  }

  function disarm() {
    send(SecuritySystemProperty.TargetState, SecuritySystemState.Disarmed);
  }

  function toggle() {
    if (guarded.value) disarm();
    else arm();
  }

  function defaultMode(): number | undefined {
    return armModes.value.includes(SecuritySystemState.AwayArm) ? SecuritySystemState.AwayArm : armModes.value[0];
  }

  return { current, target, triggered, wantsArmed, pending, guarded, armModes, color, calm, stateText, modeLabel, arm, disarm, toggle };
}

export function useSecurityPress(target: MaybeRefOrGetter<HTMLElement | null | undefined>, system: ReturnType<typeof useSecuritySystem>, interactive: () => boolean) {
  return useGuardedPress(target, {
    interactive,
    guarded: () => system.guarded.value,
    onGuarded: system.disarm,
    onTap: () => system.arm(),
    onToggle: system.toggle,
  });
}
