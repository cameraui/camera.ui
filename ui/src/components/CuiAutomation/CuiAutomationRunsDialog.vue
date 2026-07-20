<template>
  <div class="flex flex-col gap-2 min-w-0">
    <template v-if="isBusy">
      <Skeleton v-for="i in 3" :key="i" height="56px" />
    </template>

    <div v-else-if="!runs.length" class="flex flex-col items-center gap-2 py-10">
      <i-mdi:history class="w-8 h-8 text-muted" />
      <span class="text-sm text-muted">{{ t('views.automations.no_runs') }}</span>
    </div>

    <template v-else>
      <div v-for="(run, index) in runs" :key="`${run.startedAt}-${index}`" class="border border-surface rounded-lg overflow-hidden">
        <div class="flex items-center gap-2 p-3 cursor-pointer select-none" @click="toggle(index)">
          <Tag
            :severity="run.status === 'success' ? 'success' : 'danger'"
            :value="run.status === 'success' ? t('views.automations.run_success') : t('views.automations.run_error')"
            class="shrink-0"
          />

          <div class="flex flex-col flex-1 min-w-0">
            <span v-tooltip="{ value: new Date(run.startedAt).toLocaleString() }" class="text-sm text-color truncate">
              {{ formatTimeAgo(new Date(run.startedAt)) }}
            </span>
            <span class="text-xs text-muted truncate">{{ nodeLabel(run.triggerType) }} · {{ formatDuration(run.finishedAt - run.startedAt) }}</span>
          </div>

          <Tag v-if="run.warnings.length" severity="warn" class="shrink-0">
            <div class="flex items-center gap-1">
              <i-mdi:alert class="w-3.5 h-3.5" />
              <span>{{ run.warnings.length }}</span>
            </div>
          </Tag>

          <i-mdi:chevron-down class="w-4 h-4 shrink-0 text-muted transition-transform" :class="{ 'rotate-180': expanded.has(index) }" />
        </div>

        <div v-if="expanded.has(index)" class="flex flex-col gap-2 border-t border-surface p-3">
          <Message v-if="run.error" severity="error" class="text-sm">{{ run.error }}</Message>

          <div v-for="entry in run.entries" :key="`${entry.nodeId}-${entry.startedAt}`" class="flex flex-col gap-0.5">
            <div class="flex items-center gap-2 min-w-0">
              <span v-tooltip="{ value: entryStatusLabel(entry.status) }" class="w-2 h-2 rounded-full shrink-0" :class="entryDotClass(entry.status)" />
              <span class="text-sm text-color truncate">{{ nodeLabel(entry.nodeType) }}</span>
              <Tag v-if="entry.handle" severity="secondary" :value="entry.handle" class="shrink-0" />
              <span v-if="entry.durationMs !== undefined" class="text-xs text-muted shrink-0 ml-auto">{{ formatDuration(entry.durationMs) }}</span>
            </div>
            <span v-if="entry.error" class="text-xs text-red-500 pl-4 break-words">{{ entry.error }}</span>
          </div>

          <div v-if="run.warnings.length" class="flex flex-col gap-1 mt-1">
            <span class="text-xs font-medium text-color">{{ t('views.automations.run_warnings') }}</span>
            <span v-for="warning in run.warnings" :key="warning" class="text-xs text-muted break-words">{{ warning }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { formatTimeAgo } from '@vueuse/core';

import { AutomationsQuery } from '@/api/routes/automations.js';
import { getNodeDefinition } from './nodeDefinitions.js';

import type { RunTraceEntry } from '@shared/types';
import type { CuiAutomationRunsDialogProps } from './types.js';

const automationsQuery = new AutomationsQuery();

const props = defineProps<CuiAutomationRunsDialogProps>();

const { t } = useI18n();

const { data: runsData, isBusy } = automationsQuery.getAutomationRunsQuery(props.flowId);

const expanded = ref(new Set<number>());

const runs = computed(() => [...(runsData.value ?? [])].sort((a, b) => b.startedAt - a.startedAt));

function toggle(index: number) {
  const next = new Set(expanded.value);
  if (next.has(index)) {
    next.delete(index);
  } else {
    next.add(index);
  }
  expanded.value = next;
}

function nodeLabel(nodeType: string): string {
  const def = getNodeDefinition(nodeType);
  return def ? t(def.labelKey) : nodeType;
}

function entryStatusLabel(status: RunTraceEntry['status']): string {
  switch (status) {
    case 'completed':
      return t('views.automations.run_completed');
    case 'skipped':
      return t('views.automations.run_skipped');
    default:
      return t('views.automations.run_error');
  }
}

function entryDotClass(status: RunTraceEntry['status']): string {
  switch (status) {
    case 'completed':
      return 'bg-green-500';
    case 'error':
      return 'bg-red-500';
    default:
      return 'bg-surface-400';
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`;
}
</script>
