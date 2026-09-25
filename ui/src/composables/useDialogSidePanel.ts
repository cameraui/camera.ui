import type { DynamicDialogInstance } from 'primevue/dynamicdialogoptions';
import type { MaybeRefOrGetter, Ref } from 'vue';

interface DialogWidth {
  width?: string;
  maxWidth?: string;
}

function grow(size: string | undefined, px: number): string | undefined {
  return size && size !== 'auto' && size !== 'none' ? `calc(${size} + ${px}px)` : size;
}

export function useDialogSidePanel(open: MaybeRefOrGetter<boolean>, widthPx: number): void {
  const dialogRef = inject<Ref<DynamicDialogInstance> | undefined>('dialogRef', undefined);
  const { mdBreakpoint } = useSharedCuiBreakpoint();

  let widened: (DialogWidth & { from: DialogWidth }) | undefined;

  function apply(wide: boolean): void {
    const style = dialogRef?.value.options.props?.style as DialogWidth | undefined;
    if (!style) return;
    if (widened && (style.width !== widened.width || style.maxWidth !== widened.maxWidth)) widened = undefined;

    if (wide && !widened) {
      const from = { width: style.width, maxWidth: style.maxWidth };
      style.width = grow(from.width, widthPx);
      style.maxWidth = grow(from.maxWidth, widthPx);
      widened = { width: style.width, maxWidth: style.maxWidth, from };
    } else if (!wide && widened) {
      style.width = widened.from.width;
      style.maxWidth = widened.from.maxWidth;
      widened = undefined;
    }
  }

  watch(() => toValue(open) && !mdBreakpoint.value, apply, { immediate: true, flush: 'post' });

  onBeforeUnmount(() => apply(false));
}
