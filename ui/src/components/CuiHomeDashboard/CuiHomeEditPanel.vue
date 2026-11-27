<template>
  <DefineBody>
    <div class="home-panel__body" @dragstart="startDrop" @dragstop="stopDrop">
      <SelectButton v-model="tab" :options="tabs" option-label="label" option-value="value" :allow-empty="false" fluid />

      <template v-if="tab === 'widgets'">
        <IconField>
          <InputIcon>
            <i-carbon:search class="w-4 h-4" />
          </InputIcon>
          <InputText v-model.trim="search" :placeholder="t('views.home_dashboard.library_search')" class="w-full" />
        </IconField>
        <span class="text-xs text-muted px-2">{{ floating ? t('views.home_dashboard.library_hint_drag') : t('views.home_dashboard.library_hint_tap') }}</span>

        <section v-for="section in filtered" :key="section.key" class="flex flex-col gap-1">
          <h3 class="home-panel__heading">{{ section.label }}</h3>
          <button
            v-for="item in section.items"
            :key="item.widget.id"
            type="button"
            class="home-panel__row"
            :class="{ 'home-drag-in': !item.shown }"
            :data-gs-widget="item.shown ? undefined : dragNode(item)"
            :disabled="item.shown"
            @click="add(item)"
            @touchmove="holdScroll"
          >
            <span class="home-panel__preview">
              <component :is="item.icon" />
            </span>
            <span class="flex-1 min-w-0">
              <span class="block truncate text-sm font-semibold text-color">{{ item.label }}</span>
              <span v-if="item.detail" class="block truncate text-xs text-muted">{{ item.detail }}</span>
            </span>
            <span v-if="item.shown" class="text-xs text-muted shrink-0">{{ t('views.home_dashboard.on_page') }}</span>
            <i-mdi:drag v-else class="home-panel__grip" />
          </button>
        </section>

        <span v-if="!filtered.length" class="text-sm text-muted text-center py-4">{{ t('views.home_dashboard.library_empty') }}</span>
      </template>

      <template v-else>
        <CuiToggleRow :label="t('views.home_dashboard.auto_add')" :hint="t('views.home_dashboard.auto_add_hint')">
          <ToggleSwitch :model-value="page.autoAdd" @update:model-value="emit('auto-add', $event)" />
        </CuiToggleRow>
        <Button severity="danger" outlined fluid :label="t('views.home_dashboard.clear_page')" @click="emit('clear')" />
        <Button severity="danger" outlined fluid :label="t('views.home_dashboard.reset_page')" @click="emit('reset')" />
      </template>
    </div>
  </DefineBody>

  <Transition name="home-panel">
    <aside
      v-if="floating && visible"
      ref="asideRef"
      class="home-panel"
      :class="{ 'home-panel--dropping': dropping }"
      :style="{ right: `${right}px`, top: `max(calc(var(--cui-top-bar) + 1rem), ${top + 16}px)` }"
      :aria-label="t('views.home_dashboard.library')"
    >
      <header class="home-panel__head">
        <span class="home-panel__title">{{ t('views.home_dashboard.library') }}</span>
        <Button text rounded severity="secondary" class="cui-icon-lg" :aria-label="t('components.form.button.close')" @click="visible = false">
          <template #icon>
            <i-mdi:close />
          </template>
        </Button>
      </header>
      <ReuseBody />
    </aside>
  </Transition>

  <CuiBottomSheet v-if="!floating" v-model="visible" :lowered :title="t('views.home_dashboard.library')">
    <ReuseBody />
  </CuiBottomSheet>
</template>

<script setup lang="ts">
import { GridStack } from 'gridstack';

import { initialSize } from './layout.js';

import type { CuiHomeEditPanelEmits, CuiHomeEditPanelProps, HomeLibraryItem } from './types.js';

const props = defineProps<CuiHomeEditPanelProps>();
const emit = defineEmits<CuiHomeEditPanelEmits>();
const visible = defineModel<boolean>({ required: true });

const { t } = useI18n();

const [DefineBody, ReuseBody] = createReusableTemplate();

const DRAG_PX = 6;

const asideRef = useTemplateRef<HTMLElement>('asideRef');
let pressedAt: { x: number; y: number } | undefined;

const tab = ref<'widgets' | 'page'>('widgets');
const search = ref('');
const dropping = ref(false);
const lowered = ref(false);

const tabs = computed(() => [
  { value: 'widgets', label: t('views.home_dashboard.tab_widgets') },
  { value: 'page', label: t('views.home_dashboard.tab_page') },
]);

const filtered = computed(() => {
  const query = search.value.toLowerCase();
  if (!query) return props.sections;
  return props.sections
    .map((section) => ({ ...section, items: section.items.filter((item) => [item.label, item.detail].some((text) => text?.toLowerCase().includes(query))) }))
    .filter((section) => section.items.length);
});

function dragNode(item: HomeLibraryItem): string {
  return JSON.stringify({ id: item.widget.id, ...initialSize(item.spec, props.breakpoint) });
}

function setupDragIn() {
  if (visible.value) GridStack.setupDragIn('.home-drag-in', { appendTo: 'body', helper: 'clone' });
}

function holdScroll(event: TouchEvent) {
  const armed = event.currentTarget instanceof Element && event.currentTarget.classList.contains('ui-draggable-armed');
  if ((armed || dropping.value) && event.cancelable) event.preventDefault();
}

function startDrop() {
  dropping.value = true;
  if (!props.floating) lowered.value = true;
}

function stopDrop() {
  dropping.value = false;
  if (lowered.value) visible.value = false;
}

function add(item: HomeLibraryItem) {
  emit('add', item.widget, initialSize(item.spec, props.breakpoint));
  if (!props.floating) visible.value = false;
}

onKeyStroke('Escape', () => {
  if (props.floating) visible.value = false;
});

useEventListener(window, 'pointerdown', (event) => (pressedAt = { x: event.clientX, y: event.clientY }), { capture: true, passive: true });

onClickOutside(asideRef, (event) => {
  if ((event.target as HTMLElement).closest('.home-header')) return;
  if (pressedAt && Math.hypot(event.clientX - pressedAt.x, event.clientY - pressedAt.y) > DRAG_PX) return;
  visible.value = false;
});

watch(visible, (open) => {
  if (open) lowered.value = false;
});

onMounted(setupDragIn);
onUpdated(setupDragIn);
</script>

<style scoped>
.home-panel {
  position: fixed;
  bottom: calc(var(--cui-bottom-bar) + var(--cui-bottom-gap) + 5.5rem);
  z-index: 20;
  display: flex;
  flex-direction: column;
  width: min(24rem, calc(100vw - 2rem));
  overflow: hidden;
  border-radius: 1.75rem;
  border: 1px solid var(--border-color);
  background: var(--p-content-background);
  box-shadow: 0 24px 64px rgb(0 0 0 / 0.35);
  transition: opacity 0.2s ease;
}

.home-panel .home-panel__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 1.25rem 1.25rem;
}

.home-panel--dropping {
  opacity: 0.15;
  pointer-events: none;
}

.home-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.75rem 0.75rem 0.5rem 1.5rem;
}

.home-panel__title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-color);
}

.home-panel__body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.home-panel__heading {
  margin: 0.5rem 0.5rem 0.25rem;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-secondary-color);
}

.home-panel__row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.5rem;
  border-radius: 1.125rem;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.home-panel__row:not(:disabled):hover {
  background: var(--p-content-hover-background);
}

.home-panel__row:disabled {
  cursor: default;
  opacity: 0.6;
}

.home-drag-in:not(:disabled) {
  cursor: grab;
}

.home-panel__row.ui-draggable-dragging {
  z-index: 1100;
  background: var(--p-content-background);
  box-shadow: 0 12px 32px rgb(0 0 0 / 0.3);
  cursor: grabbing;
}

.home-panel__row:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: -2px;
}

.home-panel__preview {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 3.25rem;
  height: 3.25rem;
  border-radius: 1rem;
  background: var(--p-content-hover-background);
  color: var(--text-secondary-color);
}

.home-panel__grip {
  flex-shrink: 0;
  width: 1.25rem;
  height: 1.25rem;
  color: var(--text-secondary-color);
}

.home-panel__preview svg {
  width: 1.375rem;
  height: 1.375rem;
}

.home-panel-enter-active,
.home-panel-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.25s ease;
}

.home-panel-enter-from,
.home-panel-leave-to {
  opacity: 0;
  transform: translateX(1.5rem);
}
</style>
