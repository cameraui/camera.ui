import { isPageHeld, isPageParked, parkPage, pinPage, unparkPage, unpinPage } from '@/common/pageScroll.js';
import { isCapacitor } from '@/connection/index.js';

const NON_TEXT_INPUT_TYPES = new Set(['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'file', 'color', 'image']);
const OVERLAY_MASK = '.p-dialog-mask, .p-drawer-mask';
const OVERLAY_LIFT_MS = 250;

export type KeyboardInsetTransition = () => (() => void) | void;

const keyboardInset = ref(0);
const transitions = new Set<KeyboardInsetTransition>();
let registered = false;
let liftedOverlay: HTMLElement | undefined;

export function isTextEntryElement(element: Element | null): element is HTMLElement {
  if (element instanceof HTMLTextAreaElement) return !element.readOnly && !element.disabled;
  if (element instanceof HTMLInputElement) return !element.readOnly && !element.disabled && !NON_TEXT_INPUT_TYPES.has(element.type);
  return element instanceof HTMLElement && element.isContentEditable;
}

export function useKeyboardInset() {
  return { keyboardInset: readonly(keyboardInset) };
}

export function onKeyboardInsetTransition(transition: KeyboardInsetTransition): () => void {
  transitions.add(transition);
  document.documentElement.classList.add('cui-keyboard-flip');
  return () => {
    transitions.delete(transition);
    if (!transitions.size) document.documentElement.classList.remove('cui-keyboard-flip');
  };
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
      let focusPinned = false;
      let overlayPinned = false;
      let scrollDisabled = false;

      const syncScroll = async (): Promise<void> => {
        const disabled = focusPinned || overlayPinned;
        if (disabled === scrollDisabled) return;
        scrollDisabled = disabled;
        await Keyboard.setScroll({ isDisabled: disabled }).catch(() => undefined);
      };

      const unpinScroll = (): void => {
        if (!focusPinned) return;
        focusPinned = false;
        syncScroll().then(() => {
          if (!focusPinned) unpinPage();
        });
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

      parkUnderOverlays(
        () => {
          overlayPinned = true;
          syncScroll();
        },
        () => {
          overlayPinned = false;
          return syncScroll();
        },
      );

      document.addEventListener('focusin', (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (!isTextEntryElement(target)) return;
        const inOverlay = target.closest('.p-dialog-mask, .p-drawer-mask, .cui-bottom-sheet');
        if (!inOverlay && !isPageHeld() && (window.scrollY > 0 || document.documentElement.scrollHeight > window.innerHeight + 1)) return;
        pinPage();
        focusPinned = true;
        syncScroll();
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

function parkUnderOverlays(onPark: () => void, onRelease: () => Promise<void>): void {
  const parkedBy = new Set<Element>();

  const release = (mask: Element): void => {
    if (!parkedBy.delete(mask) || parkedBy.size) return;
    onRelease().then(() => {
      if (!parkedBy.size) unparkPage();
    });
  };

  const track = async (mask: HTMLElement): Promise<void> => {
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    const panel = mask.firstElementChild;
    const entering = [mask, panel].flatMap((el) => el?.getAnimations() ?? []);
    await Promise.all(entering.map((animation) => animation.finished.catch(() => undefined)));
    if (!panel || !mask.isConnected || mask.classList.contains('p-overlay-mask-leave-active')) return;

    const rect = panel.getBoundingClientRect();
    if (rect.left > 1 || rect.top > 1 || rect.right < window.innerWidth - 1 || rect.bottom < window.innerHeight - 1) return;

    parkedBy.add(mask);
    parkPage();
    onPark();
    const leaving = new MutationObserver(() => {
      if (!mask.classList.contains('p-overlay-mask-leave-active')) return;
      leaving.disconnect();
      release(mask);
    });
    leaving.observe(mask, { attributes: true, attributeFilter: ['class'] });
  };

  new MutationObserver((records) => {
    for (const record of records) {
      record.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement && node.matches(OVERLAY_MASK)) track(node);
      });
      record.removedNodes.forEach((node) => {
        if (node instanceof Element) release(node);
      });
    }
  }).observe(document.body, { childList: true });
}

function setInset(px: number): void {
  if (px === keyboardInset.value) return;
  if (!px) dropLiftedOverlay();
  const finish = [...transitions].map((transition) => transition());
  keyboardInset.value = px;
  document.documentElement.style.setProperty('--keyboard-inset', `${px}px`);
  for (const done of finish) done?.();
}

function scrollFocusedIntoView(): void {
  const focused = document.activeElement;
  const overlay = isTextEntryElement(focused) ? focused.closest<HTMLElement>('[data-pc-section="overlay"]') : null;
  if (overlay) {
    liftOverlay(overlay);
    return;
  }

  setTimeout(() => {
    const active = document.activeElement;
    if (!isTextEntryElement(active)) return;

    const rect = active.getBoundingClientRect();
    const limit = window.innerHeight - keyboardInset.value - 8;
    const delta = Math.min(rect.bottom - limit, Math.max(0, rect.top - 80));
    if (delta <= 0) return;

    const scroller = findScrollableAncestor(active);
    if (scroller) scroller.scrollBy({ top: delta, behavior: 'smooth' });
    else if (!isPageParked()) window.scrollBy({ top: delta, behavior: 'smooth' });
  }, 250);
}

// a dropdown closes as soon as anything behind it scrolls, so it moves above the keyboard instead
function liftOverlay(overlay: HTMLElement): void {
  const box = overlay.getBoundingClientRect();
  const limit = window.innerHeight - keyboardInset.value - 8;
  const lift = Math.min(box.bottom - limit, box.top - safeAreaTop() - 8);
  if (lift <= 0) return;
  overlay.style.translate = `0 ${-lift}px`;
  overlay.animate([{ translate: '0 0' }, { translate: `0 ${-lift}px` }], { duration: OVERLAY_LIFT_MS, easing: 'ease-out' });
  liftedOverlay = overlay;
}

function dropLiftedOverlay(): void {
  if (!liftedOverlay) return;
  liftedOverlay.style.removeProperty('translate');
  liftedOverlay = undefined;
}

function safeAreaTop(): number {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top)';
  document.body.appendChild(probe);
  const value = parseFloat(getComputedStyle(probe).paddingTop) || 0;
  probe.remove();
  return value;
}

function findScrollableAncestor(element: Element): Element | null {
  let node = element.parentElement;
  while (node) {
    if (/(auto|scroll)/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return null;
}
