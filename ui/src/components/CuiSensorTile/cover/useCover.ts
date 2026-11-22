import { CoverCapability, CoverKind, CoverProperty, CoverState, SensorType } from '@camera.ui/sdk';

import { sensorOffers, sensorTone, sensorToneColor } from '@/common/sensorDisplay.js';

import { useGuardedPress } from '../useGuardedPress.js';
import { useLiveProperty } from '../useLiveProperty.js';

import type { ReactiveSensor } from '@camera.ui/browser';
import type { MaybeRefOrGetter } from 'vue';

export function useCover(sensor: () => ReactiveSensor<object>) {
  const { t } = useI18n();
  const toast = useCuiToast();

  const target = useLiveProperty<CoverState | undefined>(sensor, CoverProperty.TargetState, undefined);
  const targetPosition = useLiveProperty<number | undefined>(sensor, CoverProperty.TargetPosition, undefined);
  const targetTilt = useLiveProperty<number | undefined>(sensor, CoverProperty.TargetTilt, undefined);

  const isGarage = computed(() => sensor().type === SensorType.Garage);
  const kind = computed(() => sensor().getProperty<CoverKind>(CoverProperty.Kind) ?? CoverKind.Shutter);
  const hasPosition = computed(() => !isGarage.value && sensor().hasCapability(CoverCapability.Position));
  const hasTilt = computed(() => !isGarage.value && sensor().hasCapability(CoverCapability.Tilt));
  const canStop = computed(() => !isGarage.value && sensorOffers(sensor(), CoverProperty.Stop));

  const current = computed(() => sensor().getProperty<CoverState>(CoverProperty.CurrentState));
  const wanted = computed(() => target.value.value ?? current.value);
  const wantsOpen = computed(() => wanted.value === CoverState.Open);
  const moving = computed(() => current.value === CoverState.Opening || current.value === CoverState.Closing);
  const obstructed = computed(() => sensor().getProperty(CoverProperty.ObstructionDetected) === true);

  const position = computed(() => {
    if (targetPosition.pending.value) return targetPosition.value.value ?? 0;
    return sensor().getProperty<number>(CoverProperty.CurrentPosition) ?? targetPosition.value.value ?? (wantsOpen.value ? 100 : 0);
  });
  const tilt = computed(() => {
    if (targetTilt.pending.value) return targetTilt.value.value ?? 0;
    return sensor().getProperty<number>(CoverProperty.CurrentTilt) ?? targetTilt.value.value ?? 0;
  });

  const isOpen = computed(() => {
    if (hasPosition.value) return position.value > 0;
    return wantsOpen.value || current.value === CoverState.Stopped;
  });
  const openRatio = computed(() => (hasPosition.value ? position.value / 100 : isOpen.value ? 1 : 0));
  const color = computed(() => (obstructed.value ? sensorTone(sensor().type, sensor()).color : sensorToneColor(sensor().type, true)));

  const stateText = computed(() => {
    if (!sensor().connected.value) return t('connection.offline');
    if (obstructed.value) return t('components.sensor_tile.obstructed');
    if (current.value === CoverState.Opening) return t('components.sensor_state.opening');
    if (current.value === CoverState.Closing) return t('components.sensor_state.closing');
    if (current.value === CoverState.Stopped) return t('components.sensor_state.stopped');
    return t(`components.sensor_state.${isOpen.value ? 'open' : 'closed'}`);
  });
  const summary = computed(() => (hasPosition.value && isOpen.value && !moving.value ? `${stateText.value} · ${position.value} %` : stateText.value));

  function open() {
    target.commit(CoverState.Open);
  }

  function close() {
    target.commit(CoverState.Closed);
  }

  function stop() {
    sensor()
      .setProperty(CoverProperty.Stop, true)
      .catch((error) => toast.add({ severity: 'error', detail: error, life: 3000 }));
  }

  function toggle() {
    if (moving.value && canStop.value) stop();
    else if (isOpen.value) close();
    else open();
  }

  return {
    isGarage,
    kind,
    hasPosition,
    hasTilt,
    canStop,
    current,
    wantsOpen,
    moving,
    obstructed,
    position,
    tilt,
    isOpen,
    openRatio,
    color,
    stateText,
    summary,
    open,
    close,
    stop,
    toggle,
    inputPosition: targetPosition.input,
    commitPosition: targetPosition.commit,
    inputTilt: targetTilt.input,
    commitTilt: targetTilt.commit,
  };
}

export function useGaragePress(target: MaybeRefOrGetter<HTMLElement | null | undefined>, cover: ReturnType<typeof useCover>, interactive: () => boolean) {
  return useGuardedPress(target, {
    interactive,
    guarded: () => !cover.wantsOpen.value,
    onGuarded: cover.open,
    onTap: cover.close,
    onToggle: cover.toggle,
  });
}
