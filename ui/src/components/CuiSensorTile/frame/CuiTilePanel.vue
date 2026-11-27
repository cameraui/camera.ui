<template>
  <div
    ref="panelRef"
    class="cui-tile tile-panel"
    :class="{ 'tile-panel--offline': offline, 'tile-panel--fit': fit }"
    :style="color ? { '--tile-color': color } : undefined"
  >
    <div ref="headerRef" class="tile-panel__header">
      <CuiTileIcon :icon :active />
      <div ref="textRef" v-tooltip.top="truncated ? fullText : null" class="tile-panel__text">
        <span class="tile-panel__title">{{ title }}</span>
        <span v-if="shownState" class="tile-panel__state" :class="{ 'tile-panel__state--note': note }">{{ shownState }}</span>
      </div>
      <div class="tile-panel__actions">
        <slot name="actions" />
      </div>
    </div>

    <div v-if="fit" ref="bodyRef" class="tile-panel__body">
      <div ref="contentRef" class="tile-panel__content">
        <slot />
      </div>
    </div>
    <slot v-else />
  </div>
</template>

<script setup lang="ts">
import { TILE_WAIT } from '../types.js';
import { useTruncation } from '../useTruncation.js';
import CuiTileIcon from './CuiTileIcon.vue';

import type { CuiTilePanelProps } from './types.js';

const props = defineProps<CuiTilePanelProps>();

const { t } = useI18n();

const wait = inject(TILE_WAIT, undefined);

// below this scale the scene goes before the rest shrinks further
const ART_SCALE = 0.85;

const panelRef = useTemplateRef<HTMLElement>('panelRef');
const headerRef = useTemplateRef<HTMLElement>('headerRef');
const bodyRef = useTemplateRef<HTMLElement>('bodyRef');
const contentRef = useTemplateRef<HTMLElement>('contentRef');
const textRef = useTemplateRef<HTMLElement>('textRef');

const note = computed(() => (props.offline ? undefined : wait?.note.value));
const shownState = computed(() => {
  if (note.value) return note.value;
  if (props.offline || !wait?.waiting.value) return props.state;
  return [props.state, t('components.sensor_tile.waiting')].filter(Boolean).join(' · ');
});
const fullText = computed(() => [props.title, shownState.value].filter(Boolean).join(' · '));

const truncated = useTruncation(textRef, () => fullText.value);

function fitContent() {
  const panel = panelRef.value;
  const content = contentRef.value;
  if (!panel || !content || !headerRef.value) return;

  const style = getComputedStyle(panel);
  const room = panel.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) - parseFloat(style.rowGap) - headerRef.value.offsetHeight;
  const heightAt = (lean: number) => {
    content.dataset.lean = String(lean);
    content.style.width = '';
    content.style.transform = '';
    return content.offsetHeight;
  };

  const full = heightAt(0);
  if (full <= room) return settle(content, 0, 1);
  const lean = heightAt(1);
  if (lean <= room) return settle(content, 1, 1);
  if (lean * ART_SCALE <= room) return settle(content, 1, room / lean);
  settle(content, 2, Math.min(1, room / heightAt(2)));
}

function settle(content: HTMLElement, lean: number, scale: number) {
  content.dataset.lean = String(lean);
  content.style.width = scale < 1 ? `${100 / scale}%` : '';
  content.style.transform = scale < 1 ? `scale(${scale})` : '';
  bodyRef.value?.classList.toggle('tile-panel__body--scaled', scale < 1);
}

useResizeObserver([panelRef, contentRef], () => {
  if (props.fit) fitContent();
});
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

.tile-panel .tile-panel__state--note {
  color: var(--p-red-500);
}

.tile-panel__body {
  display: flex;
  flex-direction: column;
  justify-content: safe center;
  flex: 1 1 auto;
  min-height: 0;
}

.tile-panel__body--scaled {
  overflow: hidden;
}

.tile-panel__content {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  gap: 1rem;
  transform-origin: top left;
}

.tile-panel__content[data-lean='1'] :deep(.tile-history),
.tile-panel__content[data-lean='2'] :deep(.tile-history),
.tile-panel__content[data-lean='2'] :deep(.tile-art) {
  display: none;
}

.tile-panel__actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}
</style>
