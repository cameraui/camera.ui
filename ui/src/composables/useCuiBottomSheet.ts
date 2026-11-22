export interface BottomSheetInstance {
  id: string;
  close: () => void;
  height: string;
  measuredHeight: number;
}

const sheetStack = ref<BottomSheetInstance[]>([]);
const bodyScrollLockCount = ref(0);
const dragProgress = ref(0); // 0 = no drag, 1 = fully dragged down

const STACK_TOP_PADDING = 8; // px
const STACK_PEEK_HEIGHT = 16; // px
const STACK_SCALE_X = 0.96;
const STACK_BRIGHTNESS = 0.92;

export function useCuiBottomSheet() {
  const register = (id: string, closeCallback: () => void, height: string): number => {
    const existingIndex = sheetStack.value.findIndex((s) => s.id === id);
    if (existingIndex !== -1) {
      sheetStack.value[existingIndex].height = height;
      return existingIndex;
    }

    const instance: BottomSheetInstance = { id, close: closeCallback, height, measuredHeight: 0 };
    sheetStack.value.push(instance);
    return sheetStack.value.length - 1;
  };

  const updateMeasuredHeight = (id: string, measuredHeight: number): void => {
    const sheet = sheetStack.value.find((s) => s.id === id);
    if (sheet) {
      sheet.measuredHeight = measuredHeight;
    }
  };

  const topmostHeight = computed<string | null>(() => {
    if (sheetStack.value.length === 0) return null;
    return sheetStack.value[sheetStack.value.length - 1].height;
  });

  const topmostMeasuredHeight = computed(() => {
    if (sheetStack.value.length === 0) return 0;
    return sheetStack.value[sheetStack.value.length - 1].measuredHeight;
  });

  const unregister = (id: string): void => {
    const index = sheetStack.value.findIndex((s) => s.id === id);
    if (index !== -1) {
      sheetStack.value.splice(index, 1);
    }
  };

  const getStackPosition = (id: string): number => {
    return sheetStack.value.findIndex((s) => s.id === id);
  };

  const isTopmost = (id: string): boolean => {
    const stack = sheetStack.value;
    return stack.length > 0 && stack[stack.length - 1].id === id;
  };

  const closeTopmost = (): void => {
    const stack = sheetStack.value;
    if (stack.length > 0) {
      stack[stack.length - 1].close();
    }
  };

  const closeAll = (): void => {
    const stack = [...sheetStack.value].reverse();
    for (const sheet of stack) {
      sheet.close();
    }
  };

  const setDragProgress = (progress: number): void => {
    dragProgress.value = Math.max(0, Math.min(1, progress));
  };

  const isDraggingActive = computed(() => dragProgress.value > 0);

  const getStackTransform = (stackPosition: number): { scaleX: number; topReserve: number; brightness: number; visible: boolean } => {
    const totalSheets = sheetStack.value.length;
    const isTopmost = stackPosition === totalSheets - 1;
    const isDirectlyBehind = stackPosition === totalSheets - 2 && totalSheets > 1;
    const progress = dragProgress.value;

    if (isTopmost) {
      return {
        topReserve: STACK_TOP_PADDING + STACK_PEEK_HEIGHT,
        scaleX: 1,
        brightness: 1,
        visible: true,
      };
    }

    if (isDirectlyBehind) {
      const topReserve = STACK_TOP_PADDING + STACK_PEEK_HEIGHT * progress;
      const scaleX = STACK_SCALE_X + (1 - STACK_SCALE_X) * progress;
      const brightness = STACK_BRIGHTNESS + (1 - STACK_BRIGHTNESS) * progress;

      return {
        topReserve,
        scaleX,
        brightness,
        visible: true,
      };
    }

    return {
      topReserve: STACK_TOP_PADDING,
      scaleX: STACK_SCALE_X,
      brightness: STACK_BRIGHTNESS,
      visible: true,
    };
  };

  const lockBodyScroll = (): void => {
    bodyScrollLockCount.value++;
    if (bodyScrollLockCount.value === 1) {
      document.body.style.overflow = 'hidden';
    }
  };

  const unlockBodyScroll = (): void => {
    bodyScrollLockCount.value--;
    if (bodyScrollLockCount.value <= 0) {
      bodyScrollLockCount.value = 0;
      document.body.style.overflow = '';
    }
  };

  const stackSize = computed(() => sheetStack.value.length);

  return {
    register,
    unregister,
    updateMeasuredHeight,
    getStackPosition,
    isTopmost,
    closeTopmost,
    closeAll,
    getStackTransform,
    topmostHeight,
    topmostMeasuredHeight,
    setDragProgress,
    dragProgress: readonly(dragProgress),
    isDraggingActive,
    lockBodyScroll,
    unlockBodyScroll,
    stackSize,
  };
}
