import type { MaybeRefOrGetter } from 'vue';

const TOP_PX = 10;
const HIDE_AFTER_PX = 24;
const REVEAL_AFTER_PX = 24;

export function useScrollHide(y: MaybeRefOrGetter<number>) {
  let lastY = toValue(y);
  let travelled = 0;
  const hidden = ref(lastY > TOP_PX);

  watch(
    () => toValue(y),
    (now) => {
      const delta = now - lastY;
      lastY = now;
      if (now <= TOP_PX) {
        hidden.value = false;
        travelled = 0;
        return;
      }
      if (delta === 0) return;
      if (Math.sign(delta) !== Math.sign(travelled)) travelled = 0;
      travelled += delta;
      if (travelled > HIDE_AFTER_PX) hidden.value = true;
      else if (travelled < -REVEAL_AFTER_PX) hidden.value = false;
    },
  );

  return hidden;
}
