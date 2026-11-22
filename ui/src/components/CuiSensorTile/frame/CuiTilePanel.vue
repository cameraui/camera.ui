<template>
  <div class="cui-tile tile-panel" :class="{ 'tile-panel--offline': offline }" :style="color ? { '--tile-color': color } : undefined">
    <div class="tile-panel__header">
      <CuiTileIcon :icon :active />
      <div ref="textRef" v-tooltip.top="truncated ? fullText : null" class="tile-panel__text">
        <span class="tile-panel__title">{{ title }}</span>
        <span v-if="state" class="tile-panel__state">{{ state }}</span>
      </div>
      <div class="tile-panel__actions">
        <slot name="actions" />
      </div>
    </div>

    <slot />
  </div>
</template>

<script setup lang="ts">
import { useTruncation } from '../useTruncation.js';
import CuiTileIcon from './CuiTileIcon.vue';

import type { CuiTilePanelProps } from './types.js';

const props = defineProps<CuiTilePanelProps>();

const fullText = computed(() => [props.title, props.state].filter(Boolean).join(' · '));

const textRef = useTemplateRef<HTMLElement>('textRef');
const truncated = useTruncation(textRef, () => fullText.value);
</script>

<style scoped>
.tile-panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-width: 0;
  padding: var(--tile-panel-padding, 1rem);
  border-radius: 1.25rem;
  background: var(--tile-panel-background, var(--p-content-background));
  border: var(--tile-panel-border, 1px solid var(--border-color));
  transition: border-color 0.25s ease;
}

.tile-panel--offline {
  opacity: 0.55;
  pointer-events: none;
}

.tile-panel__header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
}

.tile-panel__text {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.tile-panel__title {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tile-panel__state {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-secondary-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tile-panel__actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}
</style>
