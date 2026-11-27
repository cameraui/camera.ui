import { registerOpenMenu, releaseOpenMenu } from '@/common/menuRegistry.js';
import { CUI_MENU_CHROME, CUI_MENU_EDGE, CUI_MENU_MIN_HEIGHT } from '@/components/CuiMenu/types.js';

export function usePopoverFit() {
  const fitHeight = ref<string>();
  let observer: ResizeObserver | undefined;

  function fit(anchor: unknown) {
    if (!(anchor instanceof Element)) return;
    const { top, bottom } = anchor.getBoundingClientRect();
    const below = window.innerHeight - bottom;
    const space = Math.max(Math.max(below, top) - CUI_MENU_CHROME - CUI_MENU_EDGE, CUI_MENU_MIN_HEIGHT);
    fitHeight.value = `calc(${space}px - var(--safe-area-inset-${below >= top ? 'bottom' : 'top'}))`;
  }

  function keepInside(inner: HTMLElement | null | undefined) {
    const popover = inner?.closest<HTMLElement>('[data-pc-name="popover"]');
    if (!popover) return;
    observer = new ResizeObserver(() => shiftInside(popover));
    observer.observe(popover);
  }

  function release() {
    observer?.disconnect();
    observer = undefined;
  }

  return { fitHeight, fit, keepInside, release };
}

export function usePhoneSheet(hide: () => void) {
  const { phoneBreakpoint } = useSharedCuiBreakpoint();
  const sheetOpen = ref(false);

  watch(sheetOpen, (opened) => (opened ? registerOpenMenu(hide) : releaseOpenMenu(hide)));

  return { phoneBreakpoint, sheetOpen };
}

function shiftInside(popover: HTMLElement) {
  const left = popover.offsetLeft - window.scrollX;
  const right = left + popover.offsetWidth;
  const shift = left < CUI_MENU_EDGE ? CUI_MENU_EDGE - left : Math.min(window.innerWidth - CUI_MENU_EDGE - right, 0);
  if (shift) popover.style.insetInlineStart = `${parseFloat(popover.style.insetInlineStart || '0') + shift}px`;
}
