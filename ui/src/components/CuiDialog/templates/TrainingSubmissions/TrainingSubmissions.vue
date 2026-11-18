<template>
  <div class="flex flex-col gap-3">
    <div v-if="total" class="flex flex-wrap items-center justify-between gap-2">
      <span class="text-muted text-sm">{{ $t('components.training_submissions.count', selectedOption.count) }}</span>

      <Select
        v-if="serverOptions.length > 2"
        v-model="selected"
        :options="serverOptions"
        option-label="label"
        option-value="key"
        size="small"
        class="w-full sm:w-64"
        @change="applyFilter"
      >
        <template #option="{ option }">
          <div class="flex items-center justify-between w-full gap-4">
            <span class="truncate">{{ option.label }}</span>
            <span class="text-xs text-muted tabular-nums">{{ option.count }}</span>
          </div>
        </template>
      </Select>
    </div>

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
      <div v-for="item in items" :key="item.id" class="cui-card h-auto! shrink-0 p-2 flex items-center gap-3">
        <div class="w-24 aspect-video rounded-lg overflow-hidden bg-black/5 dark:bg-black/30 shrink-0">
          <CuiImage :src="item.imageUrl" image-container-class="w-full h-full" :image-style="{ objectFit: 'cover' }" />
        </div>

        <div class="flex-1 min-w-0">
          <div class="flex flex-wrap items-center gap-1">
            <span
              v-for="(count, label) in labelCounts(item)"
              :key="label"
              v-tooltip.top="labelText(String(label))"
              class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium text-white tabular-nums"
              :style="{ backgroundColor: detectionStyle(String(label)).color }"
            >
              <component :is="detectionStyle(String(label)).icon" class="w-3.5 h-3.5" />
              {{ count }}
            </span>
          </div>
          <div class="text-xs text-muted mt-1 truncate">
            {{ formatRelativeTime(new Date(item.createdAt).getTime()) }}
            <template v-if="showServer"> · {{ item.serverName ?? $t('components.training_submissions.removed_server') }}</template>
          </div>
        </div>

        <Tag v-if="item.usedInWave" severity="success" :value="$t('components.training_submissions.status_trained')" class="shrink-0" />

        <Button
          v-tooltip.left="$t('components.training_submissions.delete')"
          severity="danger"
          text
          rounded
          class="cui-icon-sm shrink-0"
          :loading="deleteSubmission.isPending.value && pendingId === item.id"
          @click="removeSubmission(item)"
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

import type { TrainingSubmission, TrainingSubmissionServer } from '@shared/types';
import type { TrainingSubmissionsFilterOption } from './types.js';

const trainingQuery = new TrainingQuery();

const { t, te } = useI18n();
const toast = useCuiToast();
const trainingSocket = useTrainingSocket();

const deleteSubmission = trainingQuery.deleteSubmissionMutation();

const ALL_SERVERS = 'all';

const pendingId = ref('');
const items = ref<TrainingSubmission[]>([]);
const total = ref(0);
const servers = ref<TrainingSubmissionServer[]>([]);
const removed = ref(0);
const selected = ref(ALL_SERVERS);
const nextCursor = ref<string | undefined>();
const loading = ref(true);
const loadingMore = ref(false);
const loadError = ref(false);
const loadMoreRef = useTemplateRef<HTMLElement>('loadMoreRef');

// a page that arrives after the filter changed is dropped
let reloads = 0;

const serverOptions = computed(() => {
  const options: TrainingSubmissionsFilterOption[] = [{ key: ALL_SERVERS, label: t('components.training_submissions.all_servers'), count: total.value, query: {} }];
  for (const server of servers.value) {
    options.push({
      key: `server-${server.id}`,
      label: server.current ? t('components.training_submissions.this_server', { name: server.name }) : server.name,
      count: server.count,
      query: { serverId: server.id },
    });
  }
  if (removed.value) {
    options.push({ key: 'removed', label: t('components.training_submissions.removed_servers'), count: removed.value, query: { removed: true } });
  }
  return options;
});

const selectedOption = computed(() => serverOptions.value.find((option) => option.key === selected.value) ?? serverOptions.value[0]);

const showServer = computed(() => serverOptions.value.length > 2 && selected.value === ALL_SERVERS);

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
  const reloadId = ++reloads;
  loading.value = items.value.length === 0;
  try {
    const page = await getTrainingSubmissions(selectedOption.value.query);
    if (reloadId !== reloads) return;
    items.value = page.items;
    total.value = page.total ?? page.items.length;
    servers.value = [...(page.servers ?? [])].sort((a, b) => Number(!!b.current) - Number(!!a.current) || a.name.localeCompare(b.name));
    removed.value = page.removed ?? 0;
    nextCursor.value = page.nextCursor;
    loadError.value = false;
  } catch {
    if (reloadId === reloads) loadError.value = true;
  } finally {
    if (reloadId === reloads) loading.value = false;
  }
}

function applyFilter(): void {
  items.value = [];
  nextCursor.value = undefined;
  reload();
}

async function loadMore(): Promise<void> {
  const cursor = nextCursor.value;
  if (!cursor || loadingMore.value) return;
  const reloadId = reloads;
  loadingMore.value = true;
  try {
    const page = await getTrainingSubmissions({ ...selectedOption.value.query, cursor });
    if (reloadId !== reloads) return;
    const known = new Set(items.value.map((i) => i.id));
    items.value.push(...page.items.filter((i) => !known.has(i.id)));
    nextCursor.value = page.nextCursor;
  } catch (error: any) {
    toast.add({ severity: 'error', detail: error?.message ?? String(error), life: 5000 });
  } finally {
    loadingMore.value = false;
  }
}

async function removeSubmission(item: TrainingSubmission): Promise<void> {
  pendingId.value = item.id;
  try {
    await deleteSubmission.mutateAsync(item.id);
    items.value = items.value.filter((i) => i.id !== item.id);
    total.value = Math.max(0, total.value - 1);
    const server = servers.value.find((s) => s.id === item.serverId);
    if (!server) {
      removed.value = Math.max(0, removed.value - 1);
    } else if (--server.count === 0) {
      servers.value = servers.value.filter((s) => s !== server);
    }
  } catch (error: any) {
    toast.add({ severity: 'error', detail: error?.message ?? String(error), life: 5000 });
  } finally {
    pendingId.value = '';
  }
}

useIntersectionObserver(loadMoreRef, ([entry]) => {
  if (entry?.isIntersecting) loadMore();
});

watch(serverOptions, (options) => {
  if (options.some((option) => option.key === selected.value)) return;
  selected.value = ALL_SERVERS;
  applyFilter();
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
