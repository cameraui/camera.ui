import type { Ref } from 'vue';

export interface UseTabSwipeOptions {
  exclude?: string[];
}

const INTERACTIVE_ELEMENTS = ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'];
const DEFAULT_EXCLUDE = ['.p-datatable', '.ace_editor', '.no-tab-swipe'];

export function useTabSwipe(target: Ref<HTMLElement | null>, onTabSwipe: (direction: 'left' | 'right') => void, options: UseTabSwipeOptions = {}): void {
  const { isTouch } = useSharedCuiUserAgent();

  const excludeSelectors = [...DEFAULT_EXCLUDE, ...(options.exclude ?? [])];
  const allowSwipe = ref(true);

  function inHorizontalScroller(el: HTMLElement): boolean {
    let node: HTMLElement | null = el;
    while (node && node !== target.value) {
      if (node.scrollWidth > node.clientWidth + 1) {
        const overflowX = getComputedStyle(node).overflowX;
        if (overflowX === 'auto' || overflowX === 'scroll') return true;
      }
      node = node.parentElement;
    }
    return false;
  }

  function onSwipeStart(e: TouchEvent | PointerEvent) {
    const eventTarget = e.target as HTMLElement;
    if (INTERACTIVE_ELEMENTS.includes(eventTarget.tagName) || excludeSelectors.some((selector) => eventTarget.closest(selector)) || inHorizontalScroller(eventTarget)) {
      allowSwipe.value = false;
    }
  }

  function onSwipeEnd() {
    allowSwipe.value = true;
  }

  const { isSwiping, direction } = isTouch.value
    ? useSwipe(target, { threshold: 50, onSwipeStart, onSwipeEnd })
    : usePointerSwipe(target, { threshold: 50, onSwipeStart, onSwipeEnd });

  watch([isSwiping, direction], () => {
    if (isSwiping.value && allowSwipe.value && (direction.value === 'left' || direction.value === 'right')) {
      onTabSwipe(direction.value);
    }
  });
}
