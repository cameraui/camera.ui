<template>
  <div>
    <div
      class="cui-terminal-toolbar flex items-center gap-1 px-2 py-1.5 bg-black/80 border-t border-white/10 overflow-x-auto no-scrollbar"
      :class="{
        'pt-3': !smBreakpoint,
      }"
    >
      <button
        v-for="key in activeKeys"
        :key="key.id"
        class="toolbar-key flex-shrink-0 px-2.5 py-1.5 rounded text-xs font-mono select-none transition-colors duration-100 border min-w-[32px] text-center cursor-pointer"
        :class="{
          'bg-white/20 border-white/30 text-white': key.modifier && activeModifiers.has(key.id),
          'bg-white/5 border-white/10 text-white/70 hover:bg-white/15 hover:text-white active:bg-white/25': !(key.modifier && activeModifiers.has(key.id)),
        }"
        @pointerdown.prevent="onKeyDown(key)"
      >
        {{ key.label }}
      </button>

      <button
        class="toolbar-key flex-shrink-0 px-2 py-1.5 rounded text-xs select-none transition-colors duration-100 border ml-auto"
        :class="{
          'bg-white/20 border-white/30 text-white': showSettings,
          'bg-white/5 border-white/10 text-white/50 hover:bg-white/15 hover:text-white': !showSettings,
        }"
        @pointerdown.prevent="showSettings = !showSettings"
      >
        <i-carbon:settings class="w-3.5 h-3.5" />
      </button>
    </div>

    <div v-if="showSettings" class="flex flex-wrap gap-1.5 px-2 py-2 bg-black/90 border-t border-white/10">
      <button
        v-for="key in ALL_KEYS"
        :key="key.id"
        class="px-2.5 py-1 rounded text-xs font-mono select-none transition-colors duration-100 border"
        :class="{
          'bg-white/20 border-white/30 text-white': visibleKeyIds.includes(key.id),
          'bg-white/5 border-white/10 text-white/30': !visibleKeyIds.includes(key.id),
        }"
        @click="toggleKeyVisibility(key.id)"
      >
        {{ key.label }}
      </button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { CTRL_MAP, DEFAULT_KEYS, DEFAULT_VISIBLE_KEYS } from './types.js';

import type { CuiTerminalToolbarEmits, TerminalKey } from './types.js';

const emit = defineEmits<CuiTerminalToolbarEmits>();

const { smBreakpoint } = useSharedCuiBreakpoint();

const ALL_KEYS = DEFAULT_KEYS;

const visibleKeyIds = useLocalStorage<string[]>('cui-terminal-toolbar-keys', DEFAULT_VISIBLE_KEYS);
const showSettings = ref(false);
const activeModifiers = reactive(new Set<string>());

const activeKeys = computed(() => {
  return visibleKeyIds.value.map((id) => ALL_KEYS.find((k) => k.id === id)).filter(Boolean) as TerminalKey[];
});

function applyModifiers(sequence: string): string {
  if (activeModifiers.has('ctrl') && sequence.length === 1) {
    const mapped = CTRL_MAP[sequence.toLowerCase()];
    if (mapped) return mapped;
  }

  if (activeModifiers.has('alt') && sequence.length === 1) {
    return `\x1b${sequence}`;
  }

  return sequence;
}

function onKeyDown(key: TerminalKey) {
  if (key.modifier) {
    if (activeModifiers.has(key.id)) {
      activeModifiers.delete(key.id);
    } else {
      activeModifiers.add(key.id);
    }
    return;
  }

  const sequence = applyModifiers(key.sequence);
  emit('send', sequence);

  activeModifiers.clear();
}

function toggleKeyVisibility(keyId: string) {
  const index = visibleKeyIds.value.indexOf(keyId);
  if (index >= 0) {
    visibleKeyIds.value.splice(index, 1);
  } else {
    visibleKeyIds.value.push(keyId);
  }
}

defineExpose({
  activeModifiers,
  applyModifiers,
});
</script>

<style scoped>
.no-scrollbar {
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.no-scrollbar::-webkit-scrollbar {
  display: none;
}

.toolbar-key {
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}
</style>
