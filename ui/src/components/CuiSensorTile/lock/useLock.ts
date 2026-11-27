import { LockProperty, LockState } from '@camera.ui/sdk';

import { sensorToneColor, toneColor } from '@/common/sensorDisplay.js';

import { SEGMENT_ACTIVE } from '../frame/segments.js';
import { useGuardedPress } from '../useGuardedPress.js';
import { useLiveProperty } from '../useLiveProperty.js';

import type { ReactiveSensor } from '@camera.ui/browser';
import type { MaybeRefOrGetter } from 'vue';

export function useLock(sensor: () => ReactiveSensor<object>) {
  const { t } = useI18n();

  const target = useLiveProperty<LockState | undefined>(sensor, LockProperty.TargetState, undefined);

  const current = computed(() => sensor().getProperty<LockState>(LockProperty.CurrentState));
  const wanted = computed(() => target.value.value ?? current.value);
  const jammed = computed(() => current.value === LockState.Jammed);
  const wantsLocked = computed(() => wanted.value === LockState.Secured);
  const moving = computed(() => !jammed.value && current.value !== undefined && wanted.value !== current.value);
  const color = computed(() => (jammed.value ? toneColor('alarm') : sensorToneColor(sensor().type, true)));

  const stateText = computed(() => {
    if (!sensor().online.value) return t('connection.offline');
    if (jammed.value) return t('components.sensor_state.jammed');
    if (moving.value) return t(`components.lock.status_${wantsLocked.value ? 'locking' : 'unlocking'}`);
    if (current.value === LockState.Secured) return t('components.lock.status_locked');
    if (current.value === LockState.Unsecured) return t('components.lock.status_unlocked');
    return t('components.lock.status_unknown');
  });

  function lock() {
    target.commit(LockState.Secured);
  }

  function unlock() {
    target.commit(LockState.Unsecured);
  }

  function retry() {
    if (wanted.value !== undefined) target.commit(wanted.value);
  }

  function toggle() {
    if (jammed.value) retry();
    else if (wantsLocked.value) unlock();
    else lock();
  }

  function timelineColor(value: unknown): string | undefined {
    if (value === LockState.Jammed) return toneColor('alarm');
    return value === LockState.Secured ? SEGMENT_ACTIVE : undefined;
  }

  return { jammed, wantsLocked, moving, color, stateText, lock, unlock, retry, toggle, timelineColor };
}

export function useLockPress(target: MaybeRefOrGetter<HTMLElement | null | undefined>, lock: ReturnType<typeof useLock>, interactive: () => boolean) {
  return useGuardedPress(target, {
    interactive,
    guarded: () => !lock.jammed.value && lock.wantsLocked.value,
    onGuarded: lock.unlock,
    onTap: () => (lock.jammed.value ? lock.retry() : lock.lock()),
    onToggle: lock.toggle,
  });
}
