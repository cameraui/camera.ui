import type { FloorplanClientPoint, FloorplanPaletteItem } from './types.js';

interface PaletteDragHandlers {
  start: (item: FloorplanPaletteItem) => void;
  move: (item: FloorplanPaletteItem, point: FloorplanClientPoint) => void;
  end: (item: FloorplanPaletteItem, point: FloorplanClientPoint | null) => void;
}

interface PendingDrag {
  item: FloorplanPaletteItem;
  source: HTMLElement;
  pointerId: number;
  touch: boolean;
  start: FloorplanClientPoint;
  holdTimer?: ReturnType<typeof setTimeout>;
}

const HOLD_MS = 350;
const SLOP_PX = 8;

export function usePaletteDrag(handlers: PaletteDragHandlers) {
  let pending: PendingDrag | null = null;
  let ghost: HTMLElement | null = null;
  let grab = { x: 0, y: 0 };
  let point: FloorplanClientPoint = { clientX: 0, clientY: 0 };
  let dragged = false;

  function begin(event: PointerEvent, item: FloorplanPaletteItem): void {
    if (pending || (event.pointerType === 'mouse' && event.button !== 0)) return;

    dragged = false;
    point = { clientX: event.clientX, clientY: event.clientY };
    pending = {
      item,
      source: event.currentTarget as HTMLElement,
      pointerId: event.pointerId,
      touch: event.pointerType !== 'mouse',
      start: point,
    };
    if (pending.touch) pending.holdTimer = setTimeout(lift, HOLD_MS);

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', cancel);
  }

  function holdScroll(event: TouchEvent): void {
    // bound on the rows themselves, iOS only honours preventDefault from a listener that was there when the touch began
    if (ghost && event.cancelable) event.preventDefault();
  }

  function wasDragged(): boolean {
    return dragged;
  }

  function onMove(event: PointerEvent): void {
    if (!pending || event.pointerId !== pending.pointerId) return;
    point = { clientX: event.clientX, clientY: event.clientY };

    if (ghost) {
      place();
      handlers.move(pending.item, point);
      return;
    }

    if (Math.hypot(point.clientX - pending.start.clientX, point.clientY - pending.start.clientY) <= SLOP_PX) return;
    if (pending.touch) cancel();
    else lift();
  }

  function onUp(event: PointerEvent): void {
    if (!pending || event.pointerId !== pending.pointerId) return;
    finish(point);
  }

  function cancel(): void {
    finish(null);
  }

  function finish(at: FloorplanClientPoint | null): void {
    const item = pending?.item;
    const lifted = !!ghost;
    stop();
    if (item && lifted) handlers.end(item, at);
  }

  function lift(): void {
    if (!pending) return;

    const rect = pending.source.getBoundingClientRect();
    grab = { x: point.clientX - rect.left, y: point.clientY - rect.top };
    ghost = pending.source.cloneNode(true) as HTMLElement;
    Object.assign(ghost.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      width: `${rect.width}px`,
      margin: '0',
      zIndex: '10000',
      pointerEvents: 'none',
      opacity: '0.92',
      boxShadow: '0 10px 30px rgb(0 0 0 / 0.25)',
    });
    document.body.append(ghost);
    place();

    dragged = true;
    navigator.vibrate?.(10);
    handlers.start(pending.item);
    handlers.move(pending.item, point);
  }

  function place(): void {
    if (ghost) ghost.style.transform = `translate(${point.clientX - grab.x}px, ${point.clientY - grab.y}px) scale(1.03)`;
  }

  function stop(): void {
    clearTimeout(pending?.holdTimer);
    pending = null;
    ghost?.remove();
    ghost = null;

    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', cancel);
  }

  onScopeDispose(stop);

  return { begin, holdScroll, wasDragged };
}
