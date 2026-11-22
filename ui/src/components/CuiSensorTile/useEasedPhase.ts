const EASE_SECONDS = 0.6;
const RESTING = 0.001;

export function useEasedPhase(rate: () => number) {
  const phase = ref(0);
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  let speed = 0;

  const { pause, resume } = useRafFn(
    ({ delta }) => {
      // a frame after a hidden tab would jump ahead
      const seconds = Math.min(delta, 100) / 1000;
      const target = reduced.value ? 0 : rate();
      speed += (target - speed) * (1 - Math.exp(-seconds / EASE_SECONDS));
      if (target === 0 && Math.abs(speed) < RESTING) {
        speed = 0;
        pause();
        return;
      }
      phase.value += speed * seconds;
    },
    { immediate: false },
  );

  watchEffect(() => {
    if (!reduced.value && rate() !== 0) resume();
  });

  return phase;
}
