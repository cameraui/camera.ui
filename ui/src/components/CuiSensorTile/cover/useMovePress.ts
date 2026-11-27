import { onToggleKey } from '../keys.js';
import { SLOP_PX } from '../usePointerDrag.js';

export type CoverDirection = 'up' | 'down';

export interface MovePressOptions {
  interactive: () => boolean;
  level: () => number | undefined;
  onMove: (direction: CoverDirection) => void;
  onCount: (percent: number | undefined) => void;
  onSet: (percent: number) => void;
}

const HOLD_MS = 350;
const HOLD_STEP = 5;
const HOLD_STEP_MS = 250;

export function useMovePress(options: MovePressOptions) {
  const pressed = ref<CoverDirection>();

  let press: { id: number; x: number; y: number; direction: CoverDirection } | undefined;
  let held: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  onBeforeUnmount(() => clearTimeout(timer));

  function listeners(direction: CoverDirection) {
    return {
      pointerdown: (event: PointerEvent) => down(event, direction),
      pointermove: move,
      pointerup: up,
      pointercancel: cancel,
      touchmove: holdScroll,
      contextmenu: (event: Event) => event.preventDefault(),
      keydown: (event: KeyboardEvent) => {
        if (options.interactive()) onToggleKey(event, () => options.onMove(direction));
      },
    };
  }

  function down(event: PointerEvent, direction: CoverDirection) {
    if (!options.interactive() || (event.pointerType === 'mouse' && event.button !== 0)) return;
    reset();
    press = { id: event.pointerId, x: event.clientX, y: event.clientY, direction };
    pressed.value = direction;
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    timer = setTimeout(count, HOLD_MS);
  }

  function count() {
    const from = held ?? options.level();
    if (!press || from === undefined) return;
    held = stepFrom(from, press.direction);
    options.onCount(held);
    if (held > 0 && held < 100) timer = setTimeout(count, HOLD_STEP_MS);
  }

  function move(event: PointerEvent) {
    if (!press || held !== undefined || event.pointerId !== press.id) return;
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) >= SLOP_PX) reset();
  }

  function up(event: PointerEvent) {
    if (!press || event.pointerId !== press.id) return;
    if (held === undefined) options.onMove(press.direction);
    else options.onSet(held);
    reset();
  }

  function cancel(event: PointerEvent) {
    if (press && event.pointerId === press.id) reset();
  }

  function holdScroll(event: TouchEvent) {
    if (held !== undefined && event.cancelable) event.preventDefault();
  }

  function reset() {
    clearTimeout(timer);
    press = undefined;
    pressed.value = undefined;
    if (held === undefined) return;
    held = undefined;
    options.onCount(undefined);
  }

  return { pressed, listeners };
}

function stepFrom(percent: number, direction: CoverDirection): number {
  // the first step lands on the grid, 37 goes to 40 or 35
  const next = direction === 'up' ? Math.floor(percent / HOLD_STEP + 1) * HOLD_STEP : Math.ceil(percent / HOLD_STEP - 1) * HOLD_STEP;
  return Math.min(100, Math.max(0, next));
}
