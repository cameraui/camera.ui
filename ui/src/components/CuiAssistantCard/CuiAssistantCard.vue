<template>
  <div class="cui-assistant-card rounded-xl px-4 py-3 text-sm">
    <div class="flex items-start gap-2">
      <i-mdi:heart-pulse v-if="card.kind === 'system_health'" class="w-5 h-5 shrink-0 text-muted mt-0.5" />
      <i-mdi:calendar-today v-else-if="card.kind === 'day_recap'" class="w-5 h-5 shrink-0 text-muted mt-0.5" />
      <i-mdi:format-list-bulleted v-else class="w-5 h-5 shrink-0 text-muted mt-0.5" />
      <div class="min-w-0 flex-1">
        <div class="font-medium text-color">{{ card.title }}</div>
        <div v-if="card.subtitle" class="text-xs text-muted">{{ card.subtitle }}</div>
      </div>
    </div>

    <div class="mt-3 flex flex-col gap-2">
      <div v-for="(item, index) in card.items" :key="index" class="flex flex-col gap-1">
        <component
          :is="itemReference(item) ? 'button' : 'div'"
          :type="itemReference(item) ? 'button' : undefined"
          class="flex w-full items-baseline gap-2 text-left"
          :class="{ 'cui-assistant-card-link cursor-pointer rounded-md': itemReference(item) }"
          :disabled="itemReference(item) && busy === itemReference(item)!.id ? true : undefined"
          @click="itemReference(item) && open(itemReference(item)!)"
        >
          <span class="cui-assistant-card-dot h-2 w-2 shrink-0 self-center rounded-full" :class="severityClass(item.severity)" />
          <span class="min-w-0 flex-1 truncate text-color">{{ item.label }}</span>
          <span class="shrink-0 font-medium tabular-nums text-color">{{ item.value }}</span>
          <i-mdi:chevron-right v-if="itemReference(item)" class="h-4 w-4 shrink-0 self-center text-muted" />
        </component>
        <div v-if="item.share !== undefined" class="cui-assistant-card-bar ml-4 h-1 overflow-hidden rounded-full">
          <div class="cui-assistant-card-fill h-full rounded-full" :style="{ width: `${Math.round(Math.min(1, Math.max(0, item.share)) * 100)}%` }" />
        </div>
        <div v-if="item.note" class="ml-4 text-xs text-muted">{{ item.note }}</div>
      </div>
    </div>

    <div v-if="card.footer" class="mt-3 text-xs text-muted">{{ card.footer }}</div>
  </div>
</template>

<script setup lang="ts">
import type { AssistantReference } from '@/components/CuiAssistantReferences/types.js';
import type { DBAssistantCardItem } from '@shared/types';
import type { CuiAssistantCardProps } from './types.js';

const props = defineProps<CuiAssistantCardProps>();

const { busy, open } = useAssistantReferences();

function itemReference(item: DBAssistantCardItem): AssistantReference | undefined {
  if (item.episodeId)
    return props.references?.find((reference) => reference.kind === 'episode' && reference.id === item.episodeId) ?? { kind: 'episode', id: item.episodeId };
  if (item.eventId) return props.references?.find((reference) => reference.kind === 'event' && reference.id === item.eventId);
  return undefined;
}

function severityClass(severity: string | undefined): string {
  if (severity === 'ok') return 'bg-success';
  if (severity === 'warn') return 'bg-warning';
  if (severity === 'error') return 'bg-danger';
  return 'cui-assistant-card-dot-plain';
}
</script>

<style scoped>
.cui-assistant-card {
  background: var(--card-background);
  border: 1px solid var(--border-color);
}

.cui-assistant-card-link {
  margin: 0 -0.375rem;
  padding: 0 0.375rem;
  transition: background 140ms ease;
}

.cui-assistant-card-link:hover:enabled {
  background: color-mix(in srgb, var(--p-primary-color) 9%, transparent);
}

.cui-assistant-card-dot-plain {
  background: var(--border-color-inner);
}

.cui-assistant-card-bar {
  background: var(--card-inner-background);
}

.cui-assistant-card-fill {
  background: var(--p-primary-color);
}
</style>
