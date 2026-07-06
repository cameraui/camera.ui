<template>
  <Card class="cui-card cursor-pointer select-none" @click="$emit('click')">
    <template #content>
      <div class="flex items-center gap-3 p-4">
        <div class="flex items-center justify-center w-10 h-10 rounded-lg shrink-0" :style="{ backgroundColor: `${triggerColor}20`, color: triggerColor }">
          <component :is="triggerIcon" class="w-5 h-5" />
        </div>

        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5">
            <span class="font-medium text-sm truncate text-color">{{ flow.name }}</span>
            <i-mdi:alert-circle v-if="flow.requiresUpdate" v-tooltip="t('views.automations.requires_update')" class="w-4 h-4 shrink-0 text-orange-500" />
          </div>
          <div class="text-xs text-muted mt-0.5">
            {{ flow.lastRun ? `${t('views.automations.last_run')}: ${formatTime(flow.lastRun.timestamp)}` : t('views.automations.never_run') }}
          </div>
        </div>

        <ToggleSwitch :model-value="flow.enabled" class="shrink-0" @click.stop @update:model-value="$emit('toggle', $event)" />

        <Button severity="danger" text rounded class="shrink-0 cui-icon-sm" @click.stop="$emit('delete')">
          <template #icon>
            <i-mdi:delete width="100%" height="100%" />
          </template>
        </Button>
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

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString();
}
</script>
