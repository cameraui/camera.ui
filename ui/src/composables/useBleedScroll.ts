import type { MaybeRefOrGetter, ShallowRef } from 'vue';

interface BleedScrollOptions {
  disabled?: MaybeRefOrGetter<boolean>;
}

export function useBleedScroll(
  container: Readonly<ShallowRef<HTMLElement | null>>,
  scroller: Readonly<ShallowRef<HTMLElement | null>>,
  options: BleedScrollOptions = {},
) {
  const { isTouch } = useSharedCuiUserAgent();

  const bleedLeft = ref(0);
  const scrollLeft = ref(0);
  const isAtStart = ref(true);
  const isSwiping = ref(false);

  const { width: containerWidth } = useElementSize(container);

  const { start: startSwipeReset } = useTimeoutFn(
    () => {
      isSwiping.value = false;
    },
    100,
    { immediate: false },
  );

  const bleedStyle = computed(() => ({
    marginLeft: `${-bleedLeft.value}px`,
    width: '100dvw',
    paddingLeft: `${bleedLeft.value}px`,
  }));

  const fadeStyle = computed(() => {
    const totalWidth = bleedLeft.value + 50;
    const stop1 = Math.min(Math.round((45 / totalWidth) * 100), 100);
    const stop2 = Math.min(Math.round((58 / totalWidth) * 100), 100);
    return {
      top: '-10px',
      height: 'calc(100% + 20px)',
      left: `${-bleedLeft.value}px`,
      width: `${totalWidth}px`,
      // eslint-disable-next-line @stylistic/max-len
      background: `linear-gradient(270deg, transparent 0%, rgba(var(--ground-background-val), 0.8) ${stop1}%, rgba(var(--ground-background-val), 0.9) ${stop2}%, rgba(var(--ground-background-val), 0.95) 100%)`,
    };
  });

  function updateBleed(): void {
    const el = container.value;
    if (!el) return;
    bleedLeft.value = el.getBoundingClientRect().left;
  }

  function updateScrollPosition(): void {
    const el = scroller.value;
    if (!el) return;
    scrollLeft.value = el.scrollLeft;
    isAtStart.value = el.scrollLeft < 5;
  }

  function scrollToStart(): void {
    const el = scroller.value;
    if (!el) return;
    scrollLeft.value = 0;
    nextTick(() => {
      el.scrollTo({ left: 0, behavior: 'smooth' });
    });
  }

  function setupSwipe(): void {
    usePointerSwipe(scroller, {
      disableTextSelect: true,
      threshold: 10,
      onSwipe: (e: PointerEvent) => {
        if (toValue(options.disabled)) return;
        isSwiping.value = true;
        scroller.value?.classList.add('cursor-grabbing');
        scroller.value?.scrollBy({ left: -e.movementX, behavior: 'smooth' });
      },
      onSwipeEnd: () => {
        scroller.value?.classList.remove('cursor-grabbing');
        startSwipeReset();
      },
    });
  }

  useEventListener(window, 'resize', updateBleed);
  useEventListener(scroller, 'scroll', updateScrollPosition, { passive: true });

  useEventListener(
    scroller,
    'wheel',
    (e: WheelEvent) => {
      if (toValue(options.disabled)) return;
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        scroller.value?.scrollBy({ left: e.deltaY });
      }
    },
    { passive: false },
  );

  watch(containerWidth, () => updateBleed());

  onMounted(() => {
    updateBleed();
    const mainEl = document.getElementById('container');
    if (mainEl) {
      useEventListener(mainEl, 'transitionend', updateBleed);
    }
    if (!isTouch.value) {
      setupSwipe();
    }
  });

  return { containerWidth, bleedLeft, bleedStyle, fadeStyle, scrollLeft, isAtStart, isSwiping, scrollToStart };
}
