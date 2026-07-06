export interface BottomSheetInstance {
  id: string;
  close: () => void;
  height: string;
  measuredHeight: number;
}

const sheetStack = ref<BottomSheetInstance[]>([]);
const bodyScrollLockCount = ref(0);
const dragProgress = ref(0); // 0 = no drag, 1 = fully dragged down

const BASE_BACKDROP_Z_INDEX = 1000;
const BASE_SHEET_Z_INDEX = 1001;
const Z_INDEX_INCREMENT = 10;

const STACK_TOP_PADDING = 8; // Minimum distance from viewport top for sheet behind
const STACK_PEEK_HEIGHT = 16; // How much the sheet behind peeks above current
const STACK_SCALE_X = 0.96; // Width of sheet behind (slightly narrower)
const STACK_BRIGHTNESS = 0.92; // Brightness of sheet behind (slightly darker)

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
    // Close from top to bottom to ensure proper cleanup
    const stack = [...sheetStack.value].reverse();
    for (const sheet of stack) {
      sheet.close();
    }
  };

  const getBackdropZIndex = (stackPosition: number): number => {
    return BASE_BACKDROP_Z_INDEX + stackPosition * Z_INDEX_INCREMENT;
  };

  const getSheetZIndex = (stackPosition: number): number => {
    return BASE_SHEET_Z_INDEX + stackPosition * Z_INDEX_INCREMENT;
  };

  const setDragProgress = (progress: number): void => {
    dragProgress.value = Math.max(0, Math.min(1, progress));
  };

  const isDraggingActive = computed(() => dragProgress.value > 0);

  const getStackTransform = (stackPosition: number): { scaleX: number; topReserve: number; brightness: number; visible: boolean } => {
    const totalSheets = sheetStack.value.length;
    const isTopmost = stackPosition === totalSheets - 1;
    const isDirectlyBehind = stackPosition === totalSheets - 2 && totalSheets > 1;
    const progress = dragProgress.value; // 0 = no drag, 1 = fully dragged

    // Current/topmost sheet: more distance from top (sheet behind peeks above)
    if (isTopmost) {
      return {
        topReserve: STACK_TOP_PADDING + STACK_PEEK_HEIGHT, // 24px
        scaleX: 1,
        brightness: 1,
        visible: true,
      };
    }

    // Sheet directly behind: animate toward front position based on drag progress
    // At progress 0: behind position (8px, 0.96, 0.92)
    // At progress 1: front position (24px, 1, 1)
    if (isDirectlyBehind) {
      const topReserve = STACK_TOP_PADDING + STACK_PEEK_HEIGHT * progress; // 8 → 24
      const scaleX = STACK_SCALE_X + (1 - STACK_SCALE_X) * progress; // 0.96 → 1
      const brightness = STACK_BRIGHTNESS + (1 - STACK_BRIGHTNESS) * progress; // 0.92 → 1

      return {
        topReserve,
        scaleX,
        brightness,
        visible: true,
      };
    }

    // Older sheets: keep the "behind" styling, they're covered by sheets in front
    return {
      topReserve: STACK_TOP_PADDING, // Same as behind position
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
    getBackdropZIndex,
    getSheetZIndex,
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
