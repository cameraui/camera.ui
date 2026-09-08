import { isCapacitor } from '@/connection/index.js';

const TAP_SLOP_PX = 10;
const NON_TEXT_INPUT_TYPES = new Set(['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'file', 'color', 'image']);
const KEEP_FOCUS_SELECTOR = 'input, textarea, select, label, [contenteditable], [class*="-overlay"], .p-popover, .p-datepicker-panel, .xterm, .cui-terminal-toolbar';

export function registerKeyboard() {
  if (!isCapacitor) return;

  Promise.all([import('@capacitor/keyboard'), import('@capacitor/core')]).then(([{ Keyboard }, { Capacitor }]) => {
    if (Capacitor.getPlatform() === 'ios') {
      Keyboard.setAccessoryBarVisible({ isVisible: false });
    }
  });

  let touchStart: { x: number; y: number } | undefined;

  document.addEventListener(
    'touchstart',
    (event) => {
      const touch = event.touches[0];
      touchStart = touch ? { x: touch.clientX, y: touch.clientY } : undefined;
    },
    { capture: true, passive: true },
  );

  document.addEventListener(
    'touchend',
    (event) => {
      const start = touchStart;
      touchStart = undefined;

      const active = document.activeElement;
      if (!isTextEntry(active)) return;

      const touch = event.changedTouches[0];
      if (!start || !touch || Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > TAP_SLOP_PX) return;

      const target = event.target;
      if (!(target instanceof Element)) return;
      if (active.contains(target) || target.closest(KEEP_FOCUS_SELECTOR)) return;

      active.blur();
    },
    { capture: true, passive: true },
  );
}

function isTextEntry(element: Element | null): element is HTMLElement {
  if (element instanceof HTMLTextAreaElement) return true;
  if (element instanceof HTMLInputElement) return !NON_TEXT_INPUT_TYPES.has(element.type);
  return element instanceof HTMLElement && element.isContentEditable;
}
