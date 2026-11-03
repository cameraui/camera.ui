<template>
  <Card v-if="variant === 'known'" class="cui-card transition-shadow cursor-pointer hover:shadow-md" @click="$emit('click')">
    <template #header>
      <div class="relative aspect-square overflow-hidden flex items-center justify-center bg-black/5 dark:bg-black/30">
        <img v-if="thumbnail" :src="thumbnail" class="w-full h-full object-cover" />
        <ProgressSpinner v-else-if="imageCount" stroke-width="6" class="cui-spinner-delayed" />
        <img v-else :src="fallbackUrl" class="w-1/2 h-1/2 object-contain" />
        <CuiFaceMarkBadge v-if="marked" :text="$t('views.faces.card_marked', { count: marked }, marked)" :danger="markedDanger" class="absolute top-1.5 left-1.5" />
      </div>
    </template>
    <template #content>
      <div class="font-medium truncate">{{ name }}</div>
      <div v-if="fewPictures" v-tooltip.top="$t('views.faces.few_pictures_hint', { count: FACE_FEW_PICTURES })" class="text-xs text-amber-500 truncate">
        {{ imageCount }} {{ $t('views.faces.images') }}
      </div>
      <div v-else class="text-xs text-muted truncate">{{ imageCount }} {{ $t('views.faces.images') }}</div>
      <div v-if="marked" class="text-xs truncate" :class="markedDanger ? 'text-red-500' : 'text-amber-500'">{{ $t('views.faces.to_check', { count: marked }) }}</div>
    </template>
  </Card>

  <div v-else class="relative" :class="selectionMode ? 'cursor-pointer' : 'cursor-default'" @click="selectionMode && $emit('click')">
    <div class="bg-neutral-900 w-full rounded-xl overflow-hidden relative border-[1px] border-color shadow-lg" style="aspect-ratio: 1 / 1">
      <img v-if="thumbnail" :src="thumbnail" class="w-full h-full object-cover" />
      <div v-else class="w-full h-full flex items-center justify-center bg-neutral-800/80">
        <ProgressSpinner stroke-width="6" class="cui-spinner-delayed" />
      </div>

      <div class="absolute top-0 left-0 right-0 p-2 bg-gradient-to-b from-black/60 to-transparent">
        <div class="flex items-center justify-between">
          <span class="flex items-center gap-1.5">
            <CuiFaceMarkBadge v-if="markText" :text="markText" :danger="!!alsoFiledUnder?.length" />
            <span class="text-xs text-white/70">{{ formattedTime }}</span>
          </span>
          <span v-if="confidence" class="text-xs font-medium" :class="confidenceColorLight">{{ Math.round(confidence * 100) }}%</span>
        </div>
      </div>

      <div v-if="selectionMode" class="absolute bottom-2 left-2 pointer-events-none">
        <div
          class="w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors"
          :class="selected ? 'bg-primary border-primary' : 'bg-black/40 border-white/80'"
        >
          <i-mdi:check v-if="selected" class="w-4 h-4 text-white" />
        </div>
      </div>

      <div
        v-if="!selectionMode"
        class="absolute bottom-0 left-0 right-0 p-1.5 bg-gradient-to-t from-black/60 to-transparent flex items-center justify-center gap-1 dark-mode"
      >
        <template v-if="variant === 'ignored'">
          <Button v-tooltip.top="$t('views.faces.restore')" severity="secondary" rounded size="small" class="cui-icon-sm text-white" @click.stop="$emit('restore')">
            <template #icon><i-mdi:eye width="100%" height="100%" /></template>
          </Button>
        </template>

        <template v-else>
          <Button
            v-if="showRemove"
            v-tooltip.top="$t('views.faces.remove_from_cluster')"
            severity="secondary"
            rounded
            size="small"
            class="cui-icon-sm text-white"
            @click.stop="$emit('remove')"
          >
            <template #icon><i-tabler:minus class="w-4 h-4" /></template>
          </Button>
          <Button
            v-else
            v-tooltip.top="$t('views.faces.assign')"
            severity="secondary"
            rounded
            size="small"
            class="cui-icon-sm text-white"
            @click.stop="$emit('assign-prompt')"
          >
            <template #icon><i-mdi:account-plus width="100%" height="100%" /></template>
          </Button>
          <Button v-tooltip.top="$t('views.faces.ignore')" severity="secondary" rounded size="small" class="cui-icon-sm text-white" @click.stop="$emit('ignore')">
            <template #icon><i-mdi:eye-off width="100%" height="100%" /></template>
          </Button>
          <Button v-tooltip.top="$t('views.faces.discard')" severity="danger" rounded size="small" class="cui-icon-sm text-white" @click.stop="$emit('skip')">
            <template #icon><i-mdi:delete width="100%" height="100%" /></template>
          </Button>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { FACE_FEW_PICTURES } from '@/common/constants.js';
import { isPartlyVisible } from '@/common/faceMarks.js';
import { getImageUrl } from '@/common/utils.js';

import type { CuiFaceCardEmits, CuiFaceCardProps } from './types.js';

const props = defineProps<CuiFaceCardProps>();

defineEmits<CuiFaceCardEmits>();

const { t } = useI18n();

const fallbackUrl = getImageUrl();

const fewPictures = computed(() => !!props.imageCount && props.imageCount < FACE_FEW_PICTURES);
const marked = computed(() => {
  const marks = props.marks;
  return (marks?.filedUnder ?? 0) + (marks?.unclear ?? 0) + (marks?.unlike ?? 0) + (marks?.partlyVisible ?? 0) + (marks?.sameAs ?? 0);
});
const markedDanger = computed(() => !!(props.marks?.filedUnder || props.marks?.unclear));
const markText = computed(() => {
  const reasons: string[] = [];
  if (props.alsoFiledUnder?.length) reasons.push(t('views.faces.assign_filed_under', { names: props.alsoFiledUnder.join(', ') }, 1));
  if (isPartlyVisible(props.clarity)) reasons.push(t('views.faces.assign_partly_visible', 1));
  return reasons.join(' ');
});

const confidenceColorLight = computed(() => {
  if (!props.confidence) return 'text-white/50';
  if (props.confidence >= 0.9) return 'text-green-400';
  if (props.confidence >= 0.7) return 'text-yellow-400';
  return 'text-red-400';
});
const formattedTime = computed(() => {
  if (!props.timestamp) return '';
  return new Date(props.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
});
</script>
