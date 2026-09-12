import { isCapacitor } from '@/connection/index.js';

const NON_TEXT_INPUT_TYPES = new Set(['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'file', 'color', 'image']);

const keyboardInset = ref(0);
let registered = false;

export function isTextEntryElement(element: Element | null): element is HTMLElement {
  if (element instanceof HTMLTextAreaElement) return !element.readOnly && !element.disabled;
  if (element instanceof HTMLInputElement) return !element.readOnly && !element.disabled && !NON_TEXT_INPUT_TYPES.has(element.type);
  return element instanceof HTMLElement && element.isContentEditable;
}

export function useKeyboardInset() {
  return { keyboardInset: readonly(keyboardInset) };
}

export function registerKeyboardInset(): void {
  if (registered || typeof window === 'undefined') return;
  registered = true;

  if (isCapacitor) {
    let nativeHeight = 0;
    let baseline = window.innerHeight;

    const apply = (): void => {
      const shrank = Math.max(0, baseline - window.innerHeight);
      setInset(Math.max(0, nativeHeight - shrank));
    };

    window.addEventListener('resize', () => {
      if (nativeHeight === 0) baseline = window.innerHeight;
      apply();
    });

    Promise.all([import('@capacitor/keyboard'), import('@capacitor/core')]).then(([{ Keyboard }, { Capacitor }]) => {
      let pinned = false;

      const unpinScroll = (): void => {
        if (!pinned) return;
        pinned = false;
        Keyboard.setScroll({ isDisabled: false });
      };

      Keyboard.addListener('keyboardWillShow', (info) => {
        nativeHeight = info.keyboardHeight;
        apply();
        scrollFocusedIntoView();
      });

      Keyboard.addListener('keyboardWillHide', () => {
        nativeHeight = 0;
        apply();
        unpinScroll();
      });

      if (Capacitor.getPlatform() !== 'ios') return;

      document.addEventListener('focusin', (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (!isTextEntryElement(target)) return;
        if (window.scrollY > 0) return;
        const inOverlay = target.closest('.p-dialog-mask, .p-drawer-mask, .cui-bottom-sheet');
        if (!inOverlay && document.documentElement.scrollHeight > window.innerHeight + 1) return;
        pinned = true;
        Keyboard.setScroll({ isDisabled: true });
      });
      document.addEventListener('focusout', unpinScroll);
    });
    return;
  }

  if (navigator.maxTouchPoints === 0) return;

  let fullHeight = window.innerHeight;

  const measure = (): void => {
    const vv = window.visualViewport;
    if (!vv) return;
    if (!isTextEntryElement(document.activeElement)) {
      setInset(0);
      return;
    }
    setInset(Math.max(0, fullHeight - vv.height - vv.offsetTop));
  };

  window.addEventListener('resize', () => {
    fullHeight = window.innerHeight;
    measure();
  });
  window.visualViewport?.addEventListener('resize', measure);
  window.visualViewport?.addEventListener('scroll', measure);
  document.addEventListener('focusin', () => setTimeout(measure, 50));
  document.addEventListener('focusout', () => setTimeout(measure, 50));
}

function setInset(px: number): void {
  if (px === keyboardInset.value) return;
  keyboardInset.value = px;
  document.documentElement.style.setProperty('--keyboard-inset', `${px}px`);
}

function scrollFocusedIntoView(): void {
  setTimeout(() => {
    const active = document.activeElement;
    if (!isTextEntryElement(active)) return;

    const rect = active.getBoundingClientRect();
    const limit = window.innerHeight - keyboardInset.value - 8;
    const delta = Math.min(rect.bottom - limit, Math.max(0, rect.top - 80));
    if (delta <= 0) return;

    const scroller = findScrollableAncestor(active);
    if (scroller) scroller.scrollBy({ top: delta, behavior: 'smooth' });
    else window.scrollBy({ top: delta, behavior: 'smooth' });
  }, 250);
}

function findScrollableAncestor(element: Element): Element | null {
  let node = element.parentElement;
  while (node) {
    if (/(auto|scroll)/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return null;
}
