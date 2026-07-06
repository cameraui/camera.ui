export interface CuiBottomSheetProps {
  modelValue: boolean;
  title?: string;
  subtitle?: string;
  centered?: boolean;
  showHandle?: boolean;
  closeOnBackdrop?: boolean;
  height?: string;
  maxHeight?: string;
  minHeight?: string;
  draggable?: boolean;
  dismissThreshold?: number;
  stackable?: boolean;
  stackableHeight?: string;
}

export interface CuiBottomSheetEmits {
  (e: 'update:modelValue', value: boolean): void;
  (e: 'close'): void;
}
