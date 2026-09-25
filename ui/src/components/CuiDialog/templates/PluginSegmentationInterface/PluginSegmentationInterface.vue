<template>
  <div>
    <div class="mb-4 flex justify-center">
      <div class="relative w-fit">
        <img :src alt="Segmentation test image" class="block max-w-full max-h-[60vh] w-auto" @load="paint" />
        <canvas ref="canvas" class="segmentation-outlines" />
      </div>
    </div>

    <div class="flex flex-col gap-2">
      <div v-for="(object, i) in objects" :key="i" class="flex items-center justify-between gap-3 p-3 rounded-lg content-background text-sm">
        <span class="truncate">
          {{ object.label ? t(detectionLabelKey(object.label)) : t('components.segmentation_interface.whole_picture') }}
          <span v-if="object.confidence != null" class="text-muted ml-1">{{ Math.round(object.confidence * 100) }}%</span>
        </span>
        <span class="text-muted shrink-0">
          {{ object.mask ? `${object.mask.width} × ${object.mask.height} px` : t('components.segmentation_interface.no_outline') }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { detectionLabelKey } from '@/common/eventLabels.js';
import { drawOutlines } from '@/utils/objectMask.js';

import type { CustomDialogComponent } from '@/composables/useCuiDialog.js';
import type { ObjectMask } from '@camera.ui/sdk';
import type { PluginSegmentationInterfaceProps } from './types.js';

const props = defineProps<PluginSegmentationInterfaceProps>();

const { t } = useI18n();

const canvas = useTemplateRef<HTMLCanvasElement>('canvas');

const masks = computed(() => props.objects.flatMap((object): ObjectMask[] => (object.mask ? [object.mask] : [])));

function paint(): void {
  if (canvas.value) drawOutlines(canvas.value, masks.value, getComputedStyle(canvas.value).color);
}

useResizeObserver(canvas, paint);

defineExpose<CustomDialogComponent>({});
</script>

<style scoped>
.segmentation-outlines {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  color: var(--p-primary-color);
  pointer-events: none;
}
</style>
