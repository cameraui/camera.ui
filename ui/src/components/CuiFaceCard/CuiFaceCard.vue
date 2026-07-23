<template>
  <Card v-if="variant === 'known'" class="cui-card transition-shadow cursor-pointer hover:shadow-md" @click="$emit('click')">
    <template #header>
      <div class="aspect-square overflow-hidden flex items-center justify-center bg-black/5 dark:bg-black/30">
        <img v-if="thumbnail" :src="thumbnail" class="w-full h-full object-cover" />
        <img v-else :src="fallbackUrl" class="w-1/2 h-1/2 object-contain" />
      </div>
    </template>
    <template #content>
      <div class="font-medium truncate">{{ name }}</div>
      <div class="text-xs text-muted">{{ imageCount }} {{ $t('views.faces.images') }}</div>
    </template>
  </Card>

  <div v-else class="relative" :class="selectionMode ? 'cursor-pointer' : 'cursor-default'" @click="selectionMode && $emit('click')">
    <div class="bg-neutral-900 w-full rounded-xl overflow-hidden relative border-[1px] border-color shadow-lg" style="aspect-ratio: 1 / 1">
      <img v-if="thumbnail" :src="thumbnail" class="w-full h-full object-cover" />
      <div v-else class="w-full h-full flex items-center justify-center bg-neutral-800/80">
        <img :src="fallbackUrl" class="w-1/3 h-1/3 object-contain opacity-20" />
      </div>

      <div class="absolute top-0 left-0 right-0 p-2 bg-gradient-to-b from-black/60 to-transparent">
        <div class="flex items-center justify-between">
          <span class="text-xs text-white/70">{{ formattedTime }}</span>
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
        <Button v-tooltip.top="$t('views.faces.discard')" severity="danger" rounded size="small" class="cui-icon-sm text-white" @click.stop="$emit('skip')">
          <template #icon><i-mdi:delete width="100%" height="100%" /></template>
        </Button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getImageUrl } from '@/common/utils.js';

import type { CuiFaceCardEmits, CuiFaceCardProps } from './types.js';

const props = defineProps<CuiFaceCardProps>();

defineEmits<CuiFaceCardEmits>();

const fallbackUrl = getImageUrl();

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
