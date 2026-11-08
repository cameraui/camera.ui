import type { MaybeRefOrGetter } from 'vue';

const TOP_PX = 10;
const COLLAPSE_AFTER_PX = 24;
const EXPAND_AFTER_PX = 24;
const IDLE_MS = 4_000;

export function useFloatingMini(y: MaybeRefOrGetter<number>, paused: MaybeRefOrGetter<boolean>) {
  let lastY = toValue(y);
  let travelled = 0;
  const mini = ref(lastY > TOP_PX);

  const { start, stop } = useTimeoutFn(
    () => {
      mini.value = true;
    },
    IDLE_MS,
    { immediate: false },
  );

  function restartIdle() {
    if (toValue(paused)) stop();
    else start();
  }

  function expand() {
    mini.value = false;
    travelled = 0;
    restartIdle();
  }

  watch(
    () => toValue(y),
    (now) => {
      const delta = now - lastY;
      lastY = now;
      restartIdle();
      if (now <= TOP_PX) {
        mini.value = false;
        travelled = 0;
        return;
      }
      if (delta === 0) return;
      if (Math.sign(delta) !== Math.sign(travelled)) travelled = 0;
      travelled += delta;
      if (travelled > COLLAPSE_AFTER_PX) mini.value = true;
      else if (travelled < -EXPAND_AFTER_PX) mini.value = false;
    },
  );

  watch(() => toValue(paused), restartIdle, { immediate: true });

  return { mini, expand };
}
