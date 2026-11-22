import { pressesInnerControl, SLOP_PX } from './usePointerDrag.js';

import type { MaybeRefOrGetter } from 'vue';

export interface HoldPressOptions {
  duration: number;
  holds: () => boolean;
  onHold: () => void;
  onTap: () => void;
}

export function useHoldPress(target: MaybeRefOrGetter<HTMLElement | null | undefined>, options: HoldPressOptions) {
  const progress = ref(0);
  const holding = ref(false);

  let press: { id: number; x: number; y: number } | undefined;
  let started = 0;
  let frame = 0;

  useEventListener(target, 'pointerdown', (event: PointerEvent) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (pressesInnerControl(event, toValue(target))) return;
    press = { id: event.pointerId, x: event.clientX, y: event.clientY };
    if (!options.holds()) return;
    holding.value = true;
    started = performance.now();
    frame = requestAnimationFrame(tick);
  });

  useEventListener(target, 'pointermove', (event: PointerEvent) => {
    if (!press || event.pointerId !== press.id) return;
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) >= SLOP_PX) drop();
  });

  useEventListener(target, 'pointerup', (event: PointerEvent) => {
    if (!press || event.pointerId !== press.id) return;
    drop();
    options.onTap();
  });

  useEventListener(target, ['pointercancel', 'pointerleave'], (event: PointerEvent) => {
    if (press && event.pointerId === press.id) drop();
  });

  // a long press on touch would open the context menu instead
  useEventListener(target, 'contextmenu', (event: Event) => event.preventDefault());

  onBeforeUnmount(() => cancelAnimationFrame(frame));

  function tick(now: number) {
    progress.value = Math.min((now - started) / options.duration, 1);
    if (progress.value < 1) {
      frame = requestAnimationFrame(tick);
      return;
    }
    drop();
    navigator.vibrate?.(15);
    options.onHold();
  }

  function drop() {
    cancelAnimationFrame(frame);
    press = undefined;
    holding.value = false;
    progress.value = 0;
  }

  return { progress, holding };
}
