<template>
  <div class="similar-results">
    <SimilarSearchBar
      :crop="request.crop"
      :object-label="request.objectLabel"
      :result="result"
      :count="items.length"
      :searching="isSearching || !isAvailable"
      :license-required="licenseRequired"
      @close="emit('close')"
    />

    <div v-if="scaled" class="px-3 pb-3 shrink-0">
      <Slider v-model="breadth" :min="0" :max="100" :aria-label="t('components.similar.more_broad')" />
      <div class="flex justify-between mt-2 text-xs text-muted">
        <span>{{ t('components.similar.more_precise') }}</span>
        <span>{{ t('components.similar.more_broad') }}</span>
      </div>
    </div>

    <CuiRecordingsGrid v-if="items.length" :items :min-item-width="180" :gap="8" :item-key="(item: SimilarResultItem) => item.key" class="flex-1 min-h-0 px-3">
      <template #item="{ item }">
        <RecordingCard
          :event="item.event"
          :camera-name="cameraById.get(item.event.cameraId)?.name"
          :camera="cameraById.get(item.event.cameraId)"
          :load-thumbnails="loadThumbnails"
          :semantic-score="item.score"
          :seg-index="item.segIndex"
          @scroll-to-event="(ts: number) => emit('open', { event: item.event, camera: cameraById.get(item.event.cameraId), timestamp: ts })"
        />
      </template>
    </CuiRecordingsGrid>

    <div v-else class="flex-1 min-h-0 flex items-center justify-center p-4 text-sm text-muted text-center">
      <i-svg-spinners:ring-resize v-if="isSearching" class="w-6 h-6" />
      <span v-else-if="result && result.mode !== 'none'">{{ t('views.recordings.similar_empty') }}</span>
    </div>

    <div class="p-3 shrink-0">
      <Button :label="t('components.similar.show_all')" severity="secondary" size="small" class="w-full" @click="emit('showAll')" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useEventStore, useSimilarSearch } from '@camera.ui/nvr';

import { CamerasQuery } from '@/api/routes/cameras.js';

import { SIMILAR_SCORE_RANGES } from './types.js';

import type { EventThumbnails, SimilarMatch } from '@camera.ui/nvr';
import type { DBCamera } from '@shared/types';
import type { CuiSimilarResultsEmits, CuiSimilarResultsProps, SimilarResultItem } from './types.js';

const camerasQuery = new CamerasQuery();

const props = defineProps<CuiSimilarResultsProps>();

const emit = defineEmits<CuiSimilarResultsEmits>();

const { t } = useI18n();
const eventStore = useEventStore('@camera.ui/camera-ui-nvr');
const { result, isSearching, isAvailable, licenseRequired, search, clear } = useSimilarSearch();

const { data: camerasData } = camerasQuery.getCamerasQuery({ page: 1, pageSize: -1 });

const breadth = ref(100);

const cameraById = computed(() => new Map<string, DBCamera>((camerasData.value?.result ?? []).map((camera) => [camera._id, camera])));

const scaled = computed(() => Boolean(result.value?.matches.some((match) => rangeOf(match))));

const items = computed<SimilarResultItem[]>(() => {
  const found = result.value;
  if (!found) return [];
  const events = new Map(found.events.map((event) => [event.id, event]));
  const list: SimilarResultItem[] = [];
  const seen = new Set<string>();
  for (const match of found.matches) {
    const event = events.get(match.eventId);
    const range = rangeOf(match);
    const minScore = range ? range[1] - (breadth.value / 100) * (range[1] - range[0]) : 0;
    if (!event || match.score < minScore) continue;
    const segIndex = match.segment >= 0 && event.segments[match.segment] ? match.segment : undefined;
    const key = segIndex === undefined ? event.id : `${event.id}:seg:${segIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    list.push({ key, event, segIndex, score: range ? match.score : undefined });
  }
  return list;
});

function rangeOf(match: SimilarMatch): [number, number] | undefined {
  const found = result.value;
  if (!found) return undefined;
  if (match.kind) return SIMILAR_SCORE_RANGES[match.kind];
  return found.mode === 'face' && found.label ? undefined : SIMILAR_SCORE_RANGES[found.mode];
}

function loadThumbnails(eventId: string, startMs: number): Promise<EventThumbnails | null> {
  const event = result.value?.events.find((e) => e.id === eventId);
  return event ? eventStore.loadThumbnails(eventId, event.cameraId, startMs) : Promise.resolve(null);
}

watch(items, (list) => {
  emit(
    'shown',
    list.map((item) => item.key),
  );
});

watch(
  [() => props.request, isAvailable],
  ([request, available]) => {
    breadth.value = 100;
    if (available) void search(request.query, {});
  },
  { immediate: true },
);

onBeforeUnmount(clear);
</script>

<style scoped>
.similar-results {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  background: var(--p-content-background);
}
</style>
