import { clampRatio } from './range.js';

import type { MaybeRefOrGetter } from 'vue';

export interface PointerDelta {
  x: number;
  y: number;
}

export interface PointerDragOptions {
  axis?: 'x' | 'y';
  draggable?: () => boolean;
  onStart?: (event: PointerEvent) => void;
  onMove: (event: PointerEvent, delta: PointerDelta) => void;
  onEnd: () => void;
  onTap?: (event: PointerEvent) => void;
}

export const SLOP_PX = 6;

export function usePointerDrag(target: MaybeRefOrGetter<Element | null | undefined>, options: PointerDragOptions) {
  const dragging = ref(false);
  let press: { id: number; x: number; y: number } | undefined;

  useEventListener(target, 'pointerdown', (event: PointerEvent) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (pressesInnerControl(event, toValue(target))) return;
    press = { id: event.pointerId, x: event.clientX, y: event.clientY };
  });

  useEventListener(target, 'pointermove', (event: PointerEvent) => {
    if (!press || event.pointerId !== press.id) return;
    const delta = { x: event.clientX - press.x, y: event.clientY - press.y };
    if (!dragging.value && !startDrag(event, delta)) return;
    options.onMove(event, delta);
  });

  useEventListener(target, 'pointerup', (event: PointerEvent) => {
    if (!press || event.pointerId !== press.id) return;
    press = undefined;
    if (dragging.value) finish();
    else options.onTap?.(event);
  });

  useEventListener(target, 'pointercancel', (event: PointerEvent) => {
    if (!press || event.pointerId !== press.id) return;
    press = undefined;
    if (dragging.value) finish();
  });

  function startDrag(event: PointerEvent, delta: PointerDelta): boolean {
    const along = options.axis === 'x' ? Math.abs(delta.x) : options.axis === 'y' ? Math.abs(delta.y) : Math.hypot(delta.x, delta.y);
    const across = options.axis === 'x' ? Math.abs(delta.y) : options.axis === 'y' ? Math.abs(delta.x) : 0;
    if (Math.max(along, across) < SLOP_PX) return false;

    // a move across the axis belongs to the page scroll and is no tap any more
    if (across > along || options.draggable?.() === false) {
      press = undefined;
      return false;
    }

    dragging.value = true;
    toValue(target)?.setPointerCapture(event.pointerId);
    options.onStart?.(event);
    return true;
  }

  function finish() {
    dragging.value = false;
    options.onEnd();
  }

  return { dragging };
}

export interface TrackDragOptions {
  disabled: () => boolean;
  value: () => number;
  keyStep: number;
  onInput: (ratio: number) => void;
  onCommit: (ratio: number) => void;
}

export function useTrackDrag(target: MaybeRefOrGetter<HTMLElement | null | undefined>, options: TrackDragOptions) {
  let last = 0;

  const { dragging } = usePointerDrag(target, {
    axis: 'x',
    draggable: () => !options.disabled(),
    onMove: (event) => {
      last = ratioAt(event);
      options.onInput(last);
    },
    onEnd: () => options.onCommit(last),
    onTap: (event) => {
      if (!options.disabled()) options.onCommit(ratioAt(event));
    },
  });

  function ratioAt(event: PointerEvent): number {
    const rect = toValue(target)!.getBoundingClientRect();
    return clampRatio((event.clientX - rect.left) / rect.width);
  }

  function onKey(event: KeyboardEvent) {
    const value = options.value();
    const next = {
      ArrowLeft: value - options.keyStep,
      ArrowDown: value - options.keyStep,
      ArrowRight: value + options.keyStep,
      ArrowUp: value + options.keyStep,
      Home: 0,
      End: 1,
    }[event.key];
    if (next === undefined || options.disabled()) return;
    event.preventDefault();
    options.onCommit(clampRatio(next));
  }

  return { dragging, onKey };
}

export function pressesInnerControl(event: PointerEvent, element: Element | null | undefined): boolean {
  // a press on a button inside the tile belongs to that button
  const control = (event.target as Element).closest('button, a, input');
  return !!control && control !== element && !!element?.contains(control);
}
