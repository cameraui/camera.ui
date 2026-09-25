<template>
  <div class="flex flex-col items-center gap-3">
    <div v-if="camera" class="relative max-w-full overflow-hidden rounded-md">
      <img :src="imageUrl" alt="" class="block max-w-full max-h-[65vh]" />
      <CuiSimilarPicker :camera="camera" :frame="image" @pick="onPick" @close="dialogRef.close()" />
    </div>
    <p v-else-if="!isLoading" class="text-sm text-muted text-center">{{ t('components.similar.image_no_camera') }}</p>
  </div>
</template>

<script setup lang="ts">
import { CamerasQuery } from '@/api/routes/cameras.js';
import { cropImage } from '@/utils/imageCrop.js';

import { READING_SLOTS } from './types.js';

import type { CustomDialogComponent } from '@/composables/useCuiDialog.js';
import type { FrameObject, SimilarQuery } from '@camera.ui/nvr';
import type { DBCamera } from '@shared/types';
import type { DynamicDialogInstance } from 'primevue/dynamicdialogoptions';
import type { Ref } from 'vue';
import type { SimilarImageSearchProps } from './types.js';

const camerasQuery = new CamerasQuery();

const props = defineProps<SimilarImageSearchProps>();

const { t } = useI18n();
const dialogRef = inject<Ref<DynamicDialogInstance>>('dialogRef')!;
const { openSimilarSearch } = useSimilarSearchRoute();

const { data: camerasData, isLoading } = camerasQuery.getCamerasQuery({ page: 1, pageSize: -1 });

const imageUrl = URL.createObjectURL(props.image);

const camera = computed<DBCamera | undefined>(() => {
  let best: DBCamera | undefined;
  let most = 0;
  for (const candidate of camerasData.value?.result ?? []) {
    const slots = candidate.assignments ?? {};
    if (candidate.disabled || !(slots.object || slots.objectAssist)) continue;
    const count = READING_SLOTS.filter((slot) => slots[slot]).length;
    if (count > most) {
      best = candidate;
      most = count;
    }
  }
  return best;
});

async function onPick(object: FrameObject & { query: SimilarQuery }): Promise<void> {
  const crop = await cropImage(props.image, object.box, object.mask);
  dialogRef.value.close();
  openSimilarSearch({ query: object.query, objectLabel: object.label, crop });
}

onBeforeUnmount(() => URL.revokeObjectURL(imageUrl));

defineExpose<CustomDialogComponent>({});
</script>
