import { ValveKind, ValveProperty, ValveState } from '@camera.ui/sdk';

import { sensorOffers, sensorStatus, toneColor } from '@/common/sensorDisplay.js';

import { useGuardedPress } from '../useGuardedPress.js';
import { useLiveProperty } from '../useLiveProperty.js';

import type { ReactiveSensor } from '@camera.ui/browser';
import type { MaybeRefOrGetter } from 'vue';

const KIND_TONES = { [ValveKind.Water]: 'info', [ValveKind.Irrigation]: 'ok', [ValveKind.Gas]: 'light' } as const;

export function useValve(sensor: () => ReactiveSensor<object>) {
  const { t } = useI18n();

  const target = useLiveProperty<number | undefined>(sensor, ValveProperty.TargetState, undefined);
  const targetPosition = useLiveProperty<number | undefined>(sensor, ValveProperty.TargetPosition, undefined);
  const duration = useLiveProperty(sensor, ValveProperty.Duration, 0);

  const kind = computed(() => sensor().getProperty<ValveKind>(ValveProperty.Kind) ?? ValveKind.Water);
  const gas = computed(() => kind.value === ValveKind.Gas);
  const color = computed(() => toneColor(KIND_TONES[kind.value] ?? 'info'));
  const hasPosition = computed(() => sensorOffers(sensor(), ValveProperty.TargetPosition));
  const hasDuration = computed(() => sensorOffers(sensor(), ValveProperty.Duration));

  const current = computed(() => sensor().getProperty<number>(ValveProperty.CurrentState));
  const wantsOpen = computed(() => (target.value.value ?? current.value) === ValveState.Open);
  const moving = computed(() => current.value === ValveState.Opening || current.value === ValveState.Closing);
  const position = computed(() => {
    if (targetPosition.pending.value) return targetPosition.value.value ?? 0;
    return sensor().getProperty<number>(ValveProperty.CurrentPosition) ?? targetPosition.value.value ?? (wantsOpen.value ? 100 : 0);
  });
  const isOpen = computed(() => (hasPosition.value ? position.value > 0 : current.value === ValveState.Open || current.value === ValveState.Opening));
  const ratio = computed(() => (hasPosition.value ? position.value / 100 : isOpen.value ? 1 : 0));

  // the plugin reports the seconds left once, the clock counts them down here
  const reported = computed(() => (hasDuration.value ? sensor().getProperty<number>(ValveProperty.Remaining) : undefined));
  const reportedAt = ref(Date.now());
  const now = useNow({ scheduler: (tick) => useIntervalFn(tick, 1_000) });
  watch(reported, () => (reportedAt.value = Date.now()));
  const remaining = computed(() => {
    if (!isOpen.value || !reported.value) return undefined;
    const left = reported.value - Math.floor((now.value.getTime() - reportedAt.value) / 1_000);
    return left > 0 ? left : undefined;
  });
  const remainingRatio = computed(() => (remaining.value !== undefined && duration.value.value > 0 ? Math.min(remaining.value / duration.value.value, 1) : undefined));

  const stateText = computed(() => {
    if (!sensor().connected.value) return t('connection.offline');
    if (remaining.value !== undefined && !moving.value) return t('components.sensor_tile.closes_in', { time: clock(remaining.value) });
    return sensorStatus(sensor().type, sensor(), t);
  });

  function open() {
    target.commit(ValveState.Open);
  }

  function close() {
    target.commit(ValveState.Closed);
  }

  function toggle() {
    if (wantsOpen.value || isOpen.value) close();
    else open();
  }

  function inputPosition(next: number) {
    targetPosition.input(Math.round(next * 100));
  }

  function commitPosition(next: number) {
    targetPosition.commit(Math.round(next * 100));
  }

  function setDuration(seconds: number) {
    duration.commit(seconds);
  }

  return {
    gas,
    color,
    hasPosition,
    hasDuration,
    wantsOpen,
    isOpen,
    position,
    ratio,
    duration,
    remaining,
    remainingRatio,
    stateText,
    open,
    close,
    toggle,
    inputPosition,
    commitPosition,
    setDuration,
  };
}

function clock(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

export function useValvePress(target: MaybeRefOrGetter<HTMLElement | null | undefined>, valve: ReturnType<typeof useValve>, interactive: () => boolean) {
  return useGuardedPress(target, {
    interactive: () => interactive() && valve.gas.value,
    guarded: () => !valve.wantsOpen.value && !valve.isOpen.value,
    onGuarded: valve.open,
    onTap: valve.close,
    onToggle: valve.toggle,
  });
}
