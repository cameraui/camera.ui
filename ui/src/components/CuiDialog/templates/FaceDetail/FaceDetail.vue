<template>
  <div>
    <div v-if="faceData.imageCount" class="text-sm text-muted mb-4">{{ faceData.imageCount }} {{ $t('views.faces.training_images') }}</div>

    <Message v-if="faceData.images.length > 0 && faceData.images.length < FACE_DETAIL_FEW_PICTURES" severity="warn" size="small" class="mb-4" :closable="false">
      {{ $t('views.faces.few_pictures_hint', { count: FACE_DETAIL_FEW_PICTURES }) }}
    </Message>

    <Message v-if="hasMarks" severity="warn" size="small" class="mb-4" :closable="false">
      {{ $t('views.faces.marks_hint') }}
    </Message>

    <div v-if="faceData.images.length" class="grid grid-cols-3 gap-2">
      <div v-for="({ img, mark }, idx) in tiles" :key="idx" class="relative aspect-square rounded-2xl overflow-hidden bg-surface-100 dark:bg-surface-800">
        <img :src="img.src" class="w-full h-full object-cover" />
        <div
          v-if="mark && openMarkId === img.id"
          class="absolute inset-x-0 bottom-0 max-h-full overflow-y-auto px-2 pt-1 pb-1.5 bg-black/75 text-white text-[11px] leading-tight"
          @click="openMarkId = undefined"
        >
          {{ mark.text }}
        </div>
        <div
          v-else-if="img.confidence"
          class="absolute bottom-0.5 right-0.5 text-[10px] font-medium px-1 rounded bg-black/60"
          :class="img.confidence >= 0.9 ? 'text-green-400' : img.confidence >= 0.7 ? 'text-yellow-400' : 'text-red-400'"
        >
          {{ Math.round(img.confidence * 100) }}%
        </div>
        <div v-if="mark" class="absolute inset-0 rounded-2xl border-2 pointer-events-none" :class="mark.danger ? 'border-red-500' : 'border-amber-400'" />
        <button
          v-if="mark"
          type="button"
          class="absolute top-1 left-1 cui-icon-sm rounded-full cursor-pointer shadow-md"
          :class="mark.danger ? 'bg-red-500 text-white' : 'bg-amber-400 text-black'"
          :title="mark.text"
          :aria-label="mark.text"
          :aria-expanded="openMarkId === img.id"
          @click="toggleMark(img.id)"
        >
          <i-mdi:account-multiple v-if="mark.kind === 'filed_under'" width="100%" height="100%" />
          <i-mdi:blur v-else-if="mark.kind === 'unclear'" width="100%" height="100%" />
          <i-mdi:circle-half-full v-else-if="mark.kind === 'partly_visible'" width="100%" height="100%" />
          <i-mdi:content-copy v-else width="100%" height="100%" />
        </button>
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
import { FACE_CLARITY_CLEAR, FACE_CLARITY_UNCLEAR } from '@/common/constants.js';
import { FACE_DETAIL_FEW_PICTURES } from './types.js';

import type { CustomDialogComponent } from '@/composables/useCuiDialog.js';
import type { FaceDetailFaceImage, FaceDetailMark, FaceDetailProps } from './types.js';

const props = defineProps<FaceDetailProps>();

const { t } = useI18n();

const openMarkId = ref<string>();

const faceData = computed(() => props.face);
const tiles = computed(() => faceData.value.images.map((img) => ({ img, mark: markOf(img) })));
const hasMarks = computed(() => tiles.value.some((tile) => tile.mark));

function markOf(img: FaceDetailFaceImage): FaceDetailMark | undefined {
  const clarity = img.clarity ?? 1;
  if (img.alsoFiledUnder?.length) {
    return { kind: 'filed_under', text: t('views.faces.mark_filed_under', { names: img.alsoFiledUnder.join(', ') }), danger: true };
  }
  if (clarity < FACE_CLARITY_UNCLEAR) return { kind: 'unclear', text: t('views.faces.mark_unclear'), danger: true };
  if (clarity < FACE_CLARITY_CLEAR) return { kind: 'partly_visible', text: t('views.faces.mark_partly_visible'), danger: false };
  if (img.sameAs) return { kind: 'same_as', text: t('views.faces.mark_same_as'), danger: false };
  return undefined;
}

function toggleMark(id: string) {
  openMarkId.value = openMarkId.value === id ? undefined : id;
}

defineExpose<CustomDialogComponent>({
  onConfirm: async () => {
    props.onDeletePerson();
    return true;
  },
});
</script>
