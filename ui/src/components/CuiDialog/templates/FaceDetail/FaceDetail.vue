<template>
  <div>
    <div v-if="faceData.imageCount" class="text-sm text-muted mb-4">{{ faceData.imageCount }} {{ $t('views.faces.training_images') }}</div>

    <div v-if="faceData.images.length" class="grid grid-cols-3 gap-2">
      <div v-for="(img, idx) in faceData.images" :key="idx" class="relative aspect-square rounded-2xl overflow-hidden bg-surface-100 dark:bg-surface-800">
        <img :src="img.src" class="w-full h-full object-cover" />
        <div
          v-if="img.confidence"
          class="absolute bottom-0.5 right-0.5 text-[10px] font-medium px-1 rounded bg-black/60"
          :class="img.confidence >= 0.9 ? 'text-green-400' : img.confidence >= 0.7 ? 'text-yellow-400' : 'text-red-400'"
        >
          {{ Math.round(img.confidence * 100) }}%
        </div>
        <Button severity="danger" rounded class="!absolute top-1 right-1 cui-icon-sm text-white" @click="onRemoveImage(idx)">
          <template #icon>
            <i-mdi:close width="100%" height="100%" />
          </template>
        </Button>
      </div>
    </div>

    <div v-else class="text-muted text-sm text-center py-8">{{ $t('views.faces.no_known_faces') }}</div>
  </div>
</template>

<script setup lang="ts">
import type { CustomDialogComponent } from '@/composables/useCuiDialog.js';
import type { FaceDetailProps } from './types.js';

const props = defineProps<FaceDetailProps>();

const faceData = computed(() => props.face);

defineExpose<CustomDialogComponent>({
  onConfirm: async () => {
    props.onDeletePerson();
    return true;
  },
});
</script>
