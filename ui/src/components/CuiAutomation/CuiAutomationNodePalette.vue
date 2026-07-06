<template>
  <div class="overflow-y-auto p-3" :class="mode === 'drag' ? 'h-full' : ''">
    <div v-if="mode === 'drag'" class="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
      {{ t('views.automation.node_palette') }}
    </div>

    <div v-for="category in categories" :key="category.key" class="mb-4">
      <div class="text-xs font-medium text-muted mb-2">
        {{ t(category.labelKey) }}
      </div>
      <div class="flex flex-col gap-1.5">
        <div
          v-for="node in category.nodes"
          :key="node.type"
          class="automation-palette-node"
          :class="mode === 'drag' ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'"
          :draggable="mode === 'drag'"
          @dragstart="mode === 'drag' ? onDragStart($event, node.type) : undefined"
          @click="mode === 'click' ? $emit('node-click', node.type) : undefined"
        >
          <div class="automation-palette-node__accent" :style="{ backgroundColor: node.color }" />

          <div class="flex items-center gap-2.5 flex-1 min-w-0 px-3 py-2.5">
            <div class="flex items-center justify-center w-8 h-8 rounded-lg shrink-0" :style="{ backgroundColor: `${node.color}15`, color: node.color }">
              <component :is="node.icon" class="w-4.5 h-4.5" />
            </div>
            <div class="flex-1 min-w-0">
              <span class="text-[13px] font-medium truncate text-color block leading-tight">{{ t(node.labelKey) }}</span>
              <span v-if="mode === 'click'" class="text-[11px] text-muted block truncate mt-0.5 leading-tight">{{ t(node.descriptionKey) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getNodesByCategory } from './nodeDefinitions.js';

import { CUI_AUTOMATION_NODE_PALETTE_DEFAULTS } from './types.js';

import type { CuiAutomationNodePaletteEmits, CuiAutomationNodePaletteProps } from './types.js';

withDefaults(defineProps<CuiAutomationNodePaletteProps>(), CUI_AUTOMATION_NODE_PALETTE_DEFAULTS);

defineEmits<CuiAutomationNodePaletteEmits>();

const { t } = useI18n();

const categories = [
  { key: 'trigger', labelKey: 'components.automation_nodes.category_triggers', nodes: getNodesByCategory('trigger') },
  { key: 'condition', labelKey: 'components.automation_nodes.category_conditions', nodes: getNodesByCategory('condition') },
  { key: 'utility', labelKey: 'components.automation_nodes.category_utilities', nodes: getNodesByCategory('utility') },
  { key: 'action', labelKey: 'components.automation_nodes.category_actions', nodes: getNodesByCategory('action') },
];

function onDragStart(event: DragEvent, nodeType: string) {
  if (!event.dataTransfer) return;
  event.dataTransfer.setData('application/automationnode', nodeType);
  event.dataTransfer.effectAllowed = 'move';
}
</script>

<style scoped>
.automation-palette-node {
  position: relative;
  display: flex;
  align-items: stretch;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--card-background);
  overflow: hidden;
  transition:
    box-shadow 0.15s ease,
    border-color 0.15s ease;
  user-select: none;
}

.automation-palette-node:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.automation-palette-node__accent {
  width: 3px;
  flex-shrink: 0;
}
</style>
