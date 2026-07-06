export function useCuiBreakpoint() {
  const { angle } = useSharedScreenOrientation();
  const windowSize = useSharedWindowSize({ listenOrientation: true });

  // <= 360px
  const xxsBreakpoint = computed(() => {
    let width = windowSize.width.value;

    if (angle.value > 0) {
      if (screen.height > screen.width) {
        width = screen.height;
      } else {
        width = screen.width;
      }
    }

    return width <= 360;
  });

  // <= 450px
  const xsBreakpoint = computed(() => {
    let width = windowSize.width.value;

    if (angle.value > 0) {
      if (screen.height > screen.width) {
        width = screen.height;
      } else {
        width = screen.width;
      }
    }

    return width <= 450;
  });

  // < 640px
  const smBreakpoint = computed(() => {
    let width = windowSize.width.value;

    if (angle.value > 0) {
      if (screen.height > screen.width) {
        width = screen.height;
      } else {
        width = screen.width;
      }
    }

    return width < 640;
  });

  // < 768px
  const mdBreakpoint = computed(() => {
    let width = windowSize.width.value;

    if (angle.value > 0) {
      if (screen.height > screen.width) {
        width = screen.height;
      } else {
        width = screen.width;
      }
    }

    return width < 768;
  });

  // >= 640px && < 1024px
  const xmdBreakpoint = computed(() => {
    let width = windowSize.width.value;

    if (angle.value > 0) {
      if (screen.height > screen.width) {
        width = screen.height;
      } else {
        width = screen.width;
      }
    }

    return width >= 640 && width < 1024;
  });

  // >= 1024px
  const lgBreakpoint = computed(() => {
    let width = windowSize.width.value;

    if (angle.value > 0) {
      if (screen.height > screen.width) {
        width = screen.height;
      } else {
        width = screen.width;
      }
    }

    return width >= 1024;
  });

  // >= 1280px
  const xlBreakpoint = computed(() => {
    let width = windowSize.width.value;

    if (angle.value > 0) {
      if (screen.height > screen.width) {
        width = screen.height;
      } else {
        width = screen.width;
      }
    }

    return width >= 1280;
  });

  // >= 1536px
  const xxlBreakpoint = computed(() => {
    let width = windowSize.width.value;

    if (angle.value > 0) {
      if (screen.height > screen.width) {
        width = screen.height;
      } else {
        width = screen.width;
      }
    }

    return width >= 1536;
  });

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
