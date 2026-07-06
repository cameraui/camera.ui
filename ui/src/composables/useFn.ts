export function useInertiaScroll(scrollElement: Ref<HTMLElement | null>) {
  let frameId: number | null = null;
  let startY = 0;
  let currentY = 0;
  let velocity = 0;
  const friction = 0.95;

  const currentTouchEvent = ref<'onTouchStart' | 'onTouchMove' | 'onTouchEnd'>();

  const onTouchStart = (e: TouchEvent) => {
    currentTouchEvent.value = 'onTouchStart';

    if (frameId !== null) {
      cancelAnimationFrame(frameId);
      frameId = null;
    }
    startY = e.touches[0].pageY;
    currentY = startY;
  };

  const onTouchMove = (e: TouchEvent) => {
    currentTouchEvent.value = 'onTouchMove';

    const y = e.touches[0].pageY;
    const deltaY = y - currentY;
    currentY = y;

    if (scrollElement.value) {
      scrollElement.value.scrollTop -= deltaY;
    }

    velocity = deltaY;
  };

  const onTouchEnd = () => {
    currentTouchEvent.value = 'onTouchEnd';

    if (Math.abs(velocity) > 0.5) {
      animateScroll();
    }
  };

  const animateScroll = () => {
    velocity *= friction;
    if (scrollElement.value) {
      scrollElement.value.scrollTop -= velocity;
    }

    if (Math.abs(velocity) > 0.5) {
      frameId = requestAnimationFrame(animateScroll);
    }
  };

  onMounted(() => {
    if (scrollElement.value) {
      scrollElement.value.addEventListener('touchstart', onTouchStart);
      scrollElement.value.addEventListener('touchmove', onTouchMove);
      scrollElement.value.addEventListener('touchend', onTouchEnd);
    }
  });

  onUnmounted(() => {
    if (scrollElement.value) {
      scrollElement.value.removeEventListener('touchstart', onTouchStart);
      scrollElement.value.removeEventListener('touchmove', onTouchMove);
      scrollElement.value.removeEventListener('touchend', onTouchEnd);
    }
    if (frameId !== null) {
      cancelAnimationFrame(frameId);
    }
  });

  return { currentTouchEvent };
}

export function useRAF(fn: () => void, options: { immediate?: boolean; updateInterval?: number } = {}) {
  const { immediate = true, updateInterval = 0 } = options;
  const isActive = ref(false);
  let rafId: number | null = null;
  let lastUpdateTime = 0;

  const loop = (time: number) => {
    if (!isActive.value) return;

    if (time - lastUpdateTime >= updateInterval) {
      fn();
      lastUpdateTime = time;
    }

    rafId = requestAnimationFrame(loop);
  };

  const resume = () => {
    if (!isActive.value) {
      isActive.value = true;
      lastUpdateTime = performance.now();
      rafId = requestAnimationFrame(loop);
    }
  };

  const pause = () => {
    isActive.value = false;
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  if (immediate) {
    resume();
  }

  onBeforeUnmount(() => {
    pause();
  });

  return {
    isActive,
    pause,
    resume,
  };
}
