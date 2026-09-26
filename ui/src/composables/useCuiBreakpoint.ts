export function useCuiBreakpoint() {
  const atLeastSm = useMediaQuery('(min-width: 40rem)');
  const atLeastMd = useMediaQuery('(min-width: 48rem)');
  const atLeastLg = useMediaQuery('(min-width: 64rem)');
  const atLeastXl = useMediaQuery('(min-width: 80rem)');
  const atLeast2xl = useMediaQuery('(min-width: 96rem)');

  // <= 360px
  const xxsBreakpoint = useMediaQuery('(max-width: 360px)');

  // <= 450px
  const xsBreakpoint = useMediaQuery('(max-width: 450px)');

  // < 640px
  const smBreakpoint = computed(() => !atLeastSm.value);

  // < 768px
  const mdBreakpoint = computed(() => !atLeastMd.value);

  // >= 640px && < 1024px
  const xmdBreakpoint = computed(() => atLeastSm.value && !atLeastLg.value);

  // >= 1024px
  const lgBreakpoint = computed(() => atLeastLg.value);

  // >= 1280px
  const xlBreakpoint = computed(() => atLeastXl.value);

  // >= 1536px
  const xxlBreakpoint = computed(() => atLeast2xl.value);

  return {
    xxsBreakpoint,
    xsBreakpoint,
    smBreakpoint,
    mdBreakpoint,
    xmdBreakpoint,
    lgBreakpoint,
    xlBreakpoint,
    xxlBreakpoint,
  };
}
