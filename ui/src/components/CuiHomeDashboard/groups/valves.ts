import { ValveKind, ValveProperty, ValveState } from '@camera.ui/sdk';

import { sensorOffers, sensorPropertySpec, toneColor } from '@/common/sensorDisplay.js';
import { DURATION_MINUTES, VALVE_TONES } from '@/components/CuiSensorTile/valve/useValve.js';

import { useGroupLevel, useGroupSend } from './groupControl.js';
import { shortNames } from './names.js';

import type { ReactiveSensor } from '@camera.ui/browser';

export interface HomeValveZone {
  sensor: ReactiveSensor;
  label: string;
  running: boolean;
  remaining?: number;
  share?: number;
  minutes?: number;
  gas: boolean;
  color: string;
}

export interface CuiHomeValveRowProps {
  zone: HomeValveZone;
  lead: boolean;
  disabled: boolean;
}

export interface CuiHomeValveRowEmits {
  (e: 'toggle'): void;
  (e: 'hint', shown: boolean): void;
}

export function useValveGroup(members: () => ReactiveSensor[]) {
  const { t } = useI18n();
  const { send } = useGroupSend();

  const now = useNow({ scheduler: (tick) => useIntervalFn(tick, 1_000) });
  const reportedAt = reactive(new Map<string, number>());

  const online = computed(() => members().filter((valve) => valve.online.value));
  const timed = computed(() => online.value.filter((valve) => sensorOffers(valve, ValveProperty.Duration)));
  const reports = computed(() => new Map(members().map((valve) => [valve.id, valve.getProperty<number>(ValveProperty.Remaining)])));
  const zones = computed<HomeValveZone[]>(() => {
    const labels = shortNames(members().map((valve) => valve.displayName.value));
    return members().map((valve, index) => zoneOf(valve, labels[index]));
  });
  const running = computed(() => zones.value.filter((zone) => zone.running));
  const left = computed(() => Math.max(0, ...running.value.map((zone) => zone.remaining ?? 0)));
  const color = computed(() => (running.value[0] ?? zones.value[0])?.color);
  const durations = computed(() => {
    const max = Math.min(...timed.value.map((valve) => sensorPropertySpec(valve, ValveProperty.Duration)?.max ?? Infinity));
    return DURATION_MINUTES.filter((minutes) => minutes * 60 <= max);
  });

  const { preview, commit: chooseMinutes } = useGroupLevel(
    () => timed.value,
    (valve, minutes) => valve.setProperty(ValveProperty.Duration, minutes * 60),
  );

  const minutes = computed(() => preview.value ?? sharedMinutes(timed.value));

  const line = computed(() => {
    if (!online.value.length) return t('connection.offline');
    if (!running.value.length) return t('views.home_dashboard.groups.valves.off');
    const names = running.value.map((zone) => zone.label).join(', ');
    return t('views.home_dashboard.groups.valves.running', { names }, running.value.length);
  });

  watch(
    reports,
    (next, before) => {
      for (const [id, seconds] of next) if (before?.get(id) !== seconds || !reportedAt.has(id)) reportedAt.set(id, Date.now());
    },
    { immediate: true },
  );

  function toggle(zone: HomeValveZone) {
    send([zone.sensor], (valve) => valve.setProperty(ValveProperty.TargetState, zone.running ? ValveState.Closed : ValveState.Open));
  }

  function stopAll() {
    const open = running.value.map((zone) => zone.sensor).filter((valve) => valve.online.value);
    send(open, (valve) => valve.setProperty(ValveProperty.TargetState, ValveState.Closed));
  }

  function zoneOf(valve: ReactiveSensor, label: string): HomeValveZone {
    const running = isOpen(valve);
    const remaining = running ? secondsLeft(valve) : undefined;
    const duration = sensorOffers(valve, ValveProperty.Duration) ? valve.getProperty<number>(ValveProperty.Duration) : undefined;
    const kind = valve.getProperty<ValveKind>(ValveProperty.Kind) ?? ValveKind.Water;
    return {
      sensor: valve,
      label,
      running,
      remaining,
      share: remaining !== undefined && duration ? Math.min(remaining / duration, 1) : undefined,
      minutes: duration ? Math.round(duration / 60) : undefined,
      gas: kind === ValveKind.Gas,
      color: toneColor(VALVE_TONES[kind] ?? 'info'),
    };
  }

  function secondsLeft(valve: ReactiveSensor): number | undefined {
    const reported = sensorOffers(valve, ValveProperty.Duration) ? valve.getProperty<number>(ValveProperty.Remaining) : undefined;
    if (!reported) return undefined;
    const since = now.value.getTime() - (reportedAt.get(valve.id) ?? now.value.getTime());
    const seconds = reported - Math.floor(since / 1_000);
    return seconds > 0 ? seconds : undefined;
  }

  return { zones, running, left, color, timed, durations, minutes, line, toggle, stopAll, chooseMinutes };
}

function isOpen(valve: ReactiveSensor): boolean {
  if (sensorOffers(valve, ValveProperty.TargetPosition)) return (valve.getProperty<number>(ValveProperty.CurrentPosition) ?? 0) > 0;
  const state = valve.getProperty<ValveState>(ValveProperty.CurrentState);
  return state === ValveState.Open || state === ValveState.Opening;
}

function sharedMinutes(valves: ReactiveSensor[]): number | undefined {
  const seconds = new Set(valves.map((valve) => valve.getProperty<number>(ValveProperty.Duration)));
  const [only] = seconds;
  return seconds.size === 1 && only ? Math.round(only / 60) : undefined;
}
