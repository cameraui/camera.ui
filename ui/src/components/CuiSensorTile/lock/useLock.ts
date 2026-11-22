import { LockProperty, LockState } from '@camera.ui/sdk';

import { sensorTone, sensorToneColor } from '@/common/sensorDisplay.js';

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
  const color = computed(() => (jammed.value ? sensorTone(sensor().type, sensor()).color : sensorToneColor(sensor().type, true)));

  const stateText = computed(() => {
    if (!sensor().connected.value) return t('connection.offline');
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

  return { jammed, wantsLocked, moving, color, stateText, lock, unlock, retry, toggle };
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
