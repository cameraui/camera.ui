<template>
  <Card class="cui-card cursor-pointer select-none" @click="$emit('click')">
    <template #content>
      <div class="flex items-center gap-3">
        <div
          v-if="selectionMode"
          class="w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors shrink-0"
          :class="selected ? 'bg-primary border-primary' : 'border-color'"
        >
          <i-mdi:check v-if="selected" class="w-4 h-4 text-white" />
        </div>

        <div class="flex items-center justify-center w-10 h-10 rounded-lg shrink-0" :style="{ backgroundColor: `${triggerColor}20`, color: triggerColor }">
          <component :is="triggerIcon" class="w-5 h-5" />
        </div>

        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5">
            <span class="font-medium text-sm truncate text-color">{{ flow.name }}</span>
            <i-mdi:alert-circle v-if="flow.requiresUpdate" v-tooltip="t('views.automations.requires_update')" class="w-4 h-4 shrink-0 text-orange-500" />
          </div>
          <div class="text-xs mt-0.5" :class="lastRunFailed ? 'text-red-500' : 'text-muted'">
            <span v-tooltip.bottom="lastRunTooltip" class="block truncate">
              {{ flow.lastRun ? `${t('views.automations.last_run')}: ${formatTime(flow.lastRun.timestamp)}` : t('views.automations.never_run') }}
            </span>
          </div>
        </div>

        <ToggleSwitch v-if="!selectionMode" :model-value="flow.enabled" class="shrink-0" @click.stop @update:model-value="$emit('toggle', $event)" />
      </div>
    </template>
  </Card>
</template>

<script setup lang="ts">
import { getNodeDefinition } from './nodeDefinitions.js';
import { CATEGORY_COLORS } from './types.js';

import type { CuiAutomationFlowCardEmits, CuiAutomationFlowCardProps } from './types.js';

const props = defineProps<CuiAutomationFlowCardProps>();

defineEmits<CuiAutomationFlowCardEmits>();

const { t } = useI18n();

const triggerNode = computed(() => {
  return props.flow.nodes.find((n) => n.type?.startsWith('trigger-'));
});

const triggerDef = computed(() => {
  if (!triggerNode.value?.type) return undefined;
  return getNodeDefinition(triggerNode.value.type);
});

const triggerIcon = computed(() => triggerDef.value?.icon);
const triggerColor = computed(() => triggerDef.value?.color ?? CATEGORY_COLORS.trigger);

const lastRunFailed = computed(() => props.flow.lastRun?.status === 'error');

const lastRunTooltip = computed(() => {
  if (!props.flow.lastRun) return undefined;
  const time = formatTime(props.flow.lastRun.timestamp);
  return { value: lastRunFailed.value && props.flow.lastRun.error ? `${time}\n${props.flow.lastRun.error}` : time };
});

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString();
}
</script>
