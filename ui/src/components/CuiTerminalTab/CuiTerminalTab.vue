<template>
  <div
    :ref="setDropRef"
    class="cui-terminal-tab shrink-0 touch-pan-x"
    :class="{ 'opacity-40': isDragging, 'select-none': !renaming }"
    data-keep-keyboard
    @pointerdown="keepFocus"
    @contextmenu.prevent
  >
    <InputText
      v-if="renaming"
      ref="input"
      v-model="draft"
      size="small"
      class="w-32"
      :maxlength="TERMINAL_TAB_NAME_MAX_LENGTH"
      :aria-label="t('views.terminal.tab_name')"
      @keydown.enter.prevent="commitRename"
      @keydown.esc.prevent="renaming = false"
      @blur="commitRename"
    />
    <CuiTopNavbarItem v-else :ref="setDragRef" type="tab" :label="name" :active :status :closeable @click="onClick" @close="$emit('close')" />
  </div>
</template>

<script setup lang="ts">
import { useDrag, useDrop } from 'vue3-dnd';

import { TERMINAL_TAB_DND_TYPE, TERMINAL_TAB_NAME_MAX_LENGTH } from './types.js';

import type { CuiTerminalTabEmits, CuiTerminalTabProps } from './types.js';

const props = defineProps<CuiTerminalTabProps>();

const emit = defineEmits<CuiTerminalTabEmits>();

const { t } = useI18n();

const [collect, drag] = useDrag(() => ({
  type: TERMINAL_TAB_DND_TYPE,
  item: () => ({ id: props.id }),
  collect: (monitor) => ({ isDragging: monitor.isDragging() }),
}));

const [, drop] = useDrop(() => ({
  accept: TERMINAL_TAB_DND_TYPE,
  hover({ id }: { id: string }, monitor) {
    const offset = monitor.getClientOffset();
    if (id === props.id || !elRef.value || !offset) return;
    const rect = elRef.value.getBoundingClientRect();
    emit('move', id, offset.x > rect.left + rect.width / 2);
  },
}));

const DOUBLE_TAP_MS = 350;

const elRef = ref<HTMLElement | null>(null);
const input = useTemplateRef<{ $el: HTMLInputElement }>('input');
const renaming = ref(false);
const draft = ref('');

let lastClickAt = 0;

const isDragging = computed(() => collect.value.isDragging);

function setDropRef(el: any) {
  elRef.value = el;
  drop(el);
}

function setDragRef(item: any) {
  drag(item?.$el ?? null);
}

function keepFocus(event: PointerEvent) {
  // a tap must not take focus from the terminal, the keyboard would close
  if (event.pointerType !== 'mouse' && !renaming.value) event.preventDefault();
}

function onClick() {
  const now = Date.now();
  // touch browsers send no reliable dblclick
  if (now - lastClickAt < DOUBLE_TAP_MS) {
    lastClickAt = 0;
    startRename();
    return;
  }
  lastClickAt = now;
  emit('select');
}

function startRename() {
  draft.value = props.name;
  renaming.value = true;
  nextTick(() => {
    input.value?.$el.focus();
    input.value?.$el.select();
  });
}

function commitRename() {
  if (!renaming.value) return;
  renaming.value = false;
  const name = draft.value.trim();
  if (name && name !== props.name) emit('rename', name);
}
</script>

<style scoped>
.cui-terminal-tab {
  -webkit-touch-callout: none;
}
</style>
