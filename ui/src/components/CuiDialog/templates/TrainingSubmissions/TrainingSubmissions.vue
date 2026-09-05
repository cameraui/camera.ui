<template>
  <div class="flex flex-col gap-3">
    <div v-if="loading" class="flex flex-col gap-2">
      <Skeleton v-for="i in 4" :key="i" height="72px" border-radius="12px" />
    </div>

    <div v-else-if="loadError" class="flex flex-col items-center gap-3 py-10">
      <i-mdi:cloud-alert class="w-10 h-10 text-muted" />
      <span class="text-muted text-sm text-center max-w-sm">{{ $t('components.training_submissions.load_failed') }}</span>
    </div>

    <div v-else-if="!items.length" class="flex flex-col items-center gap-3 py-10">
      <i-mdi:cloud-outline class="w-10 h-10 text-muted" />
      <span class="text-muted text-sm text-center max-w-sm">{{ $t('components.training_submissions.empty') }}</span>
    </div>

    <template v-else>
      <span class="text-muted text-sm">{{ $t('components.training_submissions.count', total) }}</span>

      <div v-for="item in items" :key="item.id" class="cui-card h-auto! shrink-0 p-2 flex items-center gap-3">
        <div class="w-24 aspect-video rounded-lg overflow-hidden bg-black/5 dark:bg-black/30 shrink-0">
          <CuiImage :src="item.imageUrl" image-container-class="w-full h-full" :image-style="{ objectFit: 'cover' }" />
        </div>

        <div class="flex-1 min-w-0">
          <div class="flex flex-wrap items-center gap-1">
            <span
              v-for="(count, label) in labelCounts(item)"
              :key="label"
              class="px-1.5 py-0.5 rounded text-xs font-medium text-white"
              :style="{ backgroundColor: detectionStyle(String(label)).color }"
            >
              {{ labelText(String(label)) }} ×{{ count }}
            </span>
          </div>
          <div class="text-xs text-muted mt-1">{{ formatRelativeTime(new Date(item.createdAt).getTime()) }}</div>
        </div>

        <Tag
          :severity="item.usedInWave ? 'success' : 'info'"
          :value="item.usedInWave ? $t('components.training_submissions.status_trained') : $t('components.training_submissions.status_pool')"
          class="shrink-0"
        />

        <Button
          v-tooltip.left="$t('components.training_submissions.delete')"
          severity="danger"
          text
          rounded
          class="cui-icon-sm shrink-0"
          :loading="deleteSubmission.isPending.value && pendingId === item.id"
          @click="removeSubmission(item.id)"
        >
          <template #icon><i-mdi:trash-can-outline width="100%" height="100%" /></template>
        </Button>
      </div>

      <div v-if="loadingMore" class="flex justify-center py-2">
        <i-svg-spinners:ring-resize class="w-5 h-5 text-primary" />
      </div>
      <div v-else-if="nextCursor" ref="loadMoreRef" class="h-px" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { getTrainingSubmissions, TrainingQuery } from '@/api/routes/training.js';
import { detectionStyle } from '@/common/detectionLabels';
import { formatRelativeTime } from '@/common/utils.js';

import type { TrainingSubmission } from '@shared/types';

const trainingQuery = new TrainingQuery();

const { t, te } = useI18n();
const toast = useCuiToast();
const trainingSocket = useTrainingSocket();

const deleteSubmission = trainingQuery.deleteSubmissionMutation();

const pendingId = ref('');
const items = ref<TrainingSubmission[]>([]);
const total = ref(0);
const nextCursor = ref<string | undefined>();
const loading = ref(true);
const loadingMore = ref(false);
const loadError = ref(false);
const loadMoreRef = useTemplateRef<HTMLElement>('loadMoreRef');

function labelCounts(item: TrainingSubmission): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const box of item.labels) counts[box.label] = (counts[box.label] ?? 0) + 1;
  return counts;
}

function labelText(label: string): string {
  const key = `components.training_editor.labels.${label}`;
  return te(key) ? t(key) : label;
}

async function reload(): Promise<void> {
  loading.value = items.value.length === 0;
  try {
    const page = await getTrainingSubmissions();
    items.value = page.items;
    total.value = page.total ?? page.items.length;
    nextCursor.value = page.nextCursor;
    loadError.value = false;
  } catch {
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}

async function loadMore(): Promise<void> {
  const cursor = nextCursor.value;
  if (!cursor || loadingMore.value) return;
  loadingMore.value = true;
  try {
    const page = await getTrainingSubmissions({ cursor });
    const known = new Set(items.value.map((i) => i.id));
    items.value.push(...page.items.filter((i) => !known.has(i.id)));
    nextCursor.value = page.nextCursor;
  } catch (error: any) {
    toast.add({ severity: 'error', detail: error?.message ?? String(error), life: 5000 });
  } finally {
    loadingMore.value = false;
  }
}

async function removeSubmission(id: string): Promise<void> {
  pendingId.value = id;
  try {
    await deleteSubmission.mutateAsync(id);
    items.value = items.value.filter((i) => i.id !== id);
    total.value = Math.max(0, total.value - 1);
  } catch (error: any) {
    toast.add({ severity: 'error', detail: error?.message ?? String(error), life: 5000 });
  } finally {
    pendingId.value = '';
  }
}

useIntersectionObserver(loadMoreRef, ([entry]) => {
  if (entry?.isIntersecting) loadMore();
});

watch(
  () => trainingSocket.submitProgress.value?.active,
  (active, was) => {
    if (was && !active) reload();
  },
);

const stopResync = trainingSocket.onResync(() => {
  reload();
});

onBeforeUnmount(() => {
  stopResync();
});

reload();
</script>
