export type TopbarPosition = 'left' | 'center' | 'right';

const slotCounts = reactive(new Map<TopbarPosition, number>());

const scrollToTopHandler = shallowRef<(() => void) | undefined>();

export function useCuiTopbarSlots() {
  const registerSlot = (position: TopbarPosition) => {
    slotCounts.set(position, (slotCounts.get(position) || 0) + 1);
    onUnmounted(() => {
      const count = slotCounts.get(position) || 0;
      if (count <= 1) {
        slotCounts.delete(position);
      } else {
        slotCounts.set(position, count - 1);
      }
    });
  };

  const hasSlot = (position: TopbarPosition): boolean => {
    return (slotCounts.get(position) || 0) > 0;
  };

  const registerScrollToTop = (handler: () => void) => {
    scrollToTopHandler.value = handler;
    onUnmounted(() => {
      if (scrollToTopHandler.value === handler) {
        scrollToTopHandler.value = undefined;
      }
    });
  };

  const scrollToTop = () => {
    if (scrollToTopHandler.value) {
      scrollToTopHandler.value();
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return {
    hasSlot,
    registerSlot,
    registerScrollToTop,
    scrollToTop,
  };
}
