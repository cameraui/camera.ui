<template>
  <div>
    <div class="mb-4 rounded-xl overflow-hidden">
      <img :src="src" alt="CLIP test image" class="w-full object-contain" />
    </div>

    <div class="text-sm text-muted mb-4">
      {{ response.embeddings.length }} embedding(s), {{ response.embeddings[0]?.embedding?.length ?? 0 }}-dim
      <span v-if="response.embeddingModel" class="ml-1">({{ response.embeddingModel }})</span>
    </div>

    <div class="flex gap-2 mb-4">
      <InputText v-model="searchText" class="flex-1" :placeholder="$t('components.clip_interface.enter_query')" @keyup.enter="runSearch" />
      <Button class="cui-button-medium" :label="$t('components.clip_interface.search')" :loading="searching" @click="runSearch" />
    </div>

    <div v-if="results.length" class="flex flex-col gap-2">
      <div v-for="(result, i) in results" :key="i" class="flex items-center justify-between p-3 rounded-lg content-background">
        <span class="text-sm truncate flex-1 mr-3">{{ result.query }}</span>
        <div class="flex items-center gap-2 shrink-0">
          <div class="text-sm font-medium" :class="result.displayScore >= 0.5 ? 'text-green-500' : result.displayScore >= 0.25 ? 'text-yellow-500' : 'text-red-400'">
            {{ (result.displayScore * 100).toFixed(0) }}%
          </div>
          <Tag
            :value="result.displayScore >= 0.5 ? 'Match' : result.displayScore >= 0.25 ? 'Possible' : 'No match'"
            :severity="result.displayScore >= 0.5 ? 'success' : result.displayScore >= 0.25 ? 'warn' : 'danger'"
            class="text-xs"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { CLIP_MAX, CLIP_MIN } from './types.js';

import type { CustomDialogComponent } from '@/composables/useCuiDialog.js';
import type { PluginClipInterfaceProps, PluginClipInterfaceResult } from './types.js';

const props = defineProps<PluginClipInterfaceProps>();

const log = useLogger();

const searchText = ref('');
const searching = ref(false);
const results = ref<PluginClipInterfaceResult[]>([]);

function clipDisplayScore(raw: number): number {
  return Math.max(0, Math.min(1, (raw - CLIP_MIN) / (CLIP_MAX - CLIP_MIN)));
}

async function runSearch() {
  const query = searchText.value.trim();
  if (!query || searching.value) return;

  searching.value = true;
  try {
    const { score } = await props.onTextSearch(query);
    results.value.unshift({ query, rawScore: score, displayScore: clipDisplayScore(score) });
    searchText.value = '';
  } catch (err) {
    log.error('CLIP text search failed:', err);
  } finally {
    searching.value = false;
  }
}

defineExpose<CustomDialogComponent>({});
</script>
