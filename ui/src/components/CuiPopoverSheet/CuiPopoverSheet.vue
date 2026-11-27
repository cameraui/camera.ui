<template>
  <Popover ref="popoverRef" class="shadow-lg cui-rounded-corner" v-bind="popover" @show="onShow" @hide="onHide">
    <div ref="scrollRef" class="popover-sheet__scroll" :style="scrollStyle">
      <slot :sheet="false" />
    </div>
  </Popover>

  <CuiBottomSheet v-if="sheet" v-model="sheetOpen">
    <div class="pt-4">
      <slot :sheet="true" />
    </div>
  </CuiBottomSheet>
</template>

<script setup lang="ts">
import { closeOpenMenu, registerOpenMenu, releaseOpenMenu } from '@/common/menuRegistry.js';
import { usePhoneSheet, usePopoverFit } from '@/common/popoverFit.js';

import type { Popover } from 'openvue';
import type { CuiPopoverSheetEmits, CuiPopoverSheetProps } from './types.js';

const props = withDefaults(defineProps<CuiPopoverSheetProps>(), {
  width: '20rem',
  sheet: true,
  popover: undefined,
});
const emit = defineEmits<CuiPopoverSheetEmits>();

const { fitHeight, fit, keepInside, release } = usePopoverFit();
const { phoneBreakpoint, sheetOpen } = usePhoneSheet(hide);

const popoverRef = useTemplateRef<InstanceType<typeof Popover>>('popoverRef');
const scrollRef = useTemplateRef<HTMLElement>('scrollRef');
let anchor: Element | null = null;
let shown = false;
let frame = 0;

const scrollStyle = computed(() => {
  const width = `min(${props.width}, calc(100vw - 3rem))`;
  return { maxHeight: fitHeight.value, ...(props.shrink ? { maxWidth: width } : { width }) };
});

function toggle(event: Event, target: EventTarget | null = event.currentTarget) {
  closeOpenMenu(hide, target);
  if (props.sheet && phoneBreakpoint.value) {
    sheetOpen.value = !sheetOpen.value;
    return;
  }
  const next = target instanceof Element ? target : null;
  const moving = shown && next !== anchor;
  anchor = next;
  fit(anchor);
  if (moving) {
    popoverRef.value?.show(event, target);
    popoverRef.value?.alignOverlay();
    return;
  }
  popoverRef.value?.toggle(event, target);
}

function hide() {
  sheetOpen.value = false;
  popoverRef.value?.hide();
}

function onShow() {
  shown = true;
  registerOpenMenu(hide);
  keepInside(scrollRef.value);
  document.addEventListener('scroll', follow, { capture: true, passive: true });
  window.addEventListener('resize', follow);
  emit('show');
}

function onHide() {
  shown = false;
  detach();
  emit('hide');
}

function detach() {
  release();
  releaseOpenMenu(hide);
  document.removeEventListener('scroll', follow, { capture: true });
  window.removeEventListener('resize', follow);
  cancelAnimationFrame(frame);
}

function follow() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    const rect = anchor?.isConnected ? anchor.getBoundingClientRect() : undefined;
    const visible = rect && rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
    if (visible) popoverRef.value?.alignOverlay();
    else hide();
  });
}

watch(sheetOpen, (opened) => {
  if (opened) emit('show');
  else emit('hide');
});

onBeforeUnmount(detach);

defineExpose({ toggle, hide });
</script>

<style scoped>
.popover-sheet__scroll {
  overflow-y: auto;
  overscroll-behavior: contain;
  margin: -0.25rem;
  padding: 0.25rem;
}
</style>
