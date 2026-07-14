<template>
  <div class="relative w-full h-full min-w-0">
    <Button
      v-tooltip.left="{ value: $t('components.form.button.copy'), disabled: !hasSelection }"
      type="button"
      rounded
      :disabled="!hasSelection"
      class="!absolute top-2 right-2 z-10 !w-8 !h-8 !p-0 opacity-30 text-black"
      :class="{
        'opacity-80': hasSelection,
      }"
      @click="copySelection"
    >
      <i-mdi:content-copy class="w-4 h-4" />
    </Button>

    <div
      ref="terminalContainerRef"
      class="w-full h-full bg-none z-1 overflow-hidden p-2 min-w-0"
      :class="{
        'pb-0': !smBreakpoint && !ignoreBreakpoint,
      }"
    ></div>
  </div>
</template>

<script setup lang="ts">
import '@xterm/xterm/css/xterm.css';

import { FitAddon } from '@xterm/addon-fit';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal } from '@xterm/xterm';

import type { ITerminalAddon, ITerminalOptions } from '@xterm/xterm';
import type { VConsoleOptions } from './types.js';

const props = withDefaults(defineProps<VConsoleOptions>(), {
  options: () => ({
    fontSize: 14,
  }),
});

const emit = defineEmits<{ resize: [cols: number] }>();

const { smBreakpoint } = useSharedCuiBreakpoint();
const { t } = useI18n();
const toast = useCuiToast();
const { copy } = useClipboard({ legacy: true });

const { options, ignoreBreakpoint } = toRefs(props);

const DEFAULT_OPTIONS: Partial<ITerminalOptions> = {
  fontSize: 14,
  scrollback: 5000,
  allowTransparency: false,
  smoothScrollDuration: 0,
  disableStdin: true,
  allowProposedApi: true,
};

const terminalContainerRef = useTemplateRef('terminalContainerRef');
const scrollPosition = ref(0);
const term = shallowRef<Terminal | null>(null);
const isHovering = ref(false);
const hasSelection = ref(false);

let fitAddon: FitAddon | null = null;
let unicode11Addon: Unicode11Addon | null = null;
let webLinksAddon: WebLinksAddon | null = null;
let scrollInterval: ReturnType<typeof setInterval>;
let writeBuffer = '';
let pendingNewline = false;
let freshStart = true;

const terminalContainer = useElementSize(terminalContainerRef);

const atBottom = computed(() => {
  if (!term.value) {
    return true;
  }

  const buffer = term.value.buffer.active;
  const maxScrollPosition = buffer.length - term.value.rows;
  return scrollPosition.value >= maxScrollPosition;
});

function updateScrollPosition(): void {
  if (term.value) {
    scrollPosition.value = term.value.buffer.active.viewportY;
  }
}

function fitTerminal(): void {
  if (!term.value || !fitAddon) {
    return;
  }

  fitAddon.fit();
  updateScrollPosition();

  if (term.value.cols) {
    emit('resize', term.value.cols);
  }
}

function resizeHandler(): void {
  fitTerminal();
  term.value?.scrollToBottom();
  updateScrollPosition();
}

const debouncedUpdateScrollPosition = useDebounceFn(updateScrollPosition, 16);
const debouncedResizeHandler = useDebounceFn(resizeHandler, 100);

const {
  start: startWriteFlush,
  stop: stopWriteFlush,
  isPending: isWriteFlushPending,
} = useTimeoutFn(
  () => {
    if (term.value && writeBuffer) {
      term.value.write(writeBuffer);
      writeBuffer = '';
      debouncedUpdateScrollPosition();
    }
  },
  16,
  { immediate: false },
);

function writeTerminal(data: string): void {
  if (freshStart) {
    data = data.replace(/^[\r\n]+/, '');
    if (!data) {
      return;
    }
    freshStart = false;
  }

  if (pendingNewline) {
    writeBuffer += '\n';
    pendingNewline = false;
  }

  if (data.endsWith('\n')) {
    writeBuffer += data.slice(0, -1);
    pendingNewline = true;
  } else if (data.endsWith('\r\n')) {
    writeBuffer += data.slice(0, -2);
    pendingNewline = true;
  } else {
    writeBuffer += data;
  }

  if (!isWriteFlushPending.value) {
    startWriteFlush();
  }
}

function scrollToBottom(): void {
  requestAnimationFrame(() => {
    term.value?.scrollToBottom();
    debouncedUpdateScrollPosition();
  });
}

function clearTerminal(): void {
  stopWriteFlush();
  writeBuffer = '';
  pendingNewline = false;
  freshStart = true;
  term.value?.reset();
  debouncedUpdateScrollPosition();
}

function getBufferText(): string {
  if (!term.value) {
    return '';
  }

  const buffer = term.value.buffer.active;
  const lines: string[] = [];
  for (let i = 0; i < buffer.length; i++) {
    lines.push(buffer.getLine(i)?.translateToString(true) ?? '');
  }

  return lines.join('\n').replace(/\s+$/, '');
}

async function copyText(text: string): Promise<boolean> {
  if (!text) {
    return false;
  }

  await copy(text);
  toast.add({ severity: 'success', detail: t('components.toast.copied'), life: 1500 });
  return true;
}

function copySelection(): boolean {
  const selection = term.value?.getSelection() ?? '';
  if (!selection) {
    return false;
  }

  copyText(selection);
  return true;
}

function copyAll(): void {
  copyText(getBufferText());
}

function handleCopyKeydown(event: KeyboardEvent): void {
  if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'c') {
    return;
  }

  if (!isHovering.value || !term.value?.hasSelection()) {
    return;
  }

  event.preventDefault();
  copySelection();
}

function handleContextMenu(event: MouseEvent): void {
  if (!term.value?.hasSelection()) {
    return;
  }

  event.preventDefault();
  copySelection();
}

// Touch devices have no xterm selection at all (renderer-independent), so the
// mobile gesture is built here: long-press anchors a line selection, dragging
// while still holding extends it line by line, and the copy button copies it.
function bufferRowAt(clientY: number): number | undefined {
  const el = term.value?.element;
  if (!term.value || !el) {
    return undefined;
  }

  const rect = el.getBoundingClientRect();
  const rowHeight = rect.height / term.value.rows;
  if (rowHeight <= 0) {
    return undefined;
  }

  const viewportRow = Math.max(0, Math.min(Math.floor((clientY - rect.top) / rowHeight), term.value.rows - 1));
  return Math.min(term.value.buffer.active.viewportY + viewportRow, term.value.buffer.active.length - 1);
}

function setupSmoothScrolling() {
  const element = term.value?.element;
  if (!element) {
    return;
  }

  let startY = 0;
  let lastY = 0;
  let scrollSpeed = 0;
  let lastTouchMove = 0;
  let isScrolling = false;
  let longPressTimer: ReturnType<typeof setTimeout> | undefined;
  let selectionAnchorRow: number | undefined;
  const maxScrollSpeed = 1.2;
  const scrollLines = 12;
  const friction = 0.92;
  const longPressMs = 500;
  const longPressMoveTolerance = 10;
  const edgeScrollZone = 28;

  function clearScrolling() {
    if (scrollInterval) {
      clearInterval(scrollInterval);
    }
  }

  function cancelLongPress() {
    clearTimeout(longPressTimer);
    longPressTimer = undefined;
  }

  function extendSelection(clientY: number) {
    if (!term.value || selectionAnchorRow === undefined) {
      return;
    }

    // Dragging past the edges scrolls the buffer so the selection can grow
    // beyond the visible viewport.
    const rect = element!.getBoundingClientRect();
    if (clientY < rect.top + edgeScrollZone) {
      term.value.scrollLines(-1);
    } else if (clientY > rect.bottom - edgeScrollZone) {
      term.value.scrollLines(1);
    }

    const row = bufferRowAt(clientY);
    if (row === undefined) {
      return;
    }

    term.value.selectLines(Math.min(selectionAnchorRow, row), Math.max(selectionAnchorRow, row));
    debouncedUpdateScrollPosition();
  }

  function handleTouchStart(event: TouchEvent) {
    clearScrolling();
    startY = event.touches[0].clientY;
    lastY = startY;
    scrollSpeed = 0;
    lastTouchMove = Date.now();
    isScrolling = false;
    selectionAnchorRow = undefined;

    cancelLongPress();
    const touchY = startY;
    longPressTimer = setTimeout(() => {
      const row = bufferRowAt(touchY);
      if (row === undefined || !term.value) {
        return;
      }
      selectionAnchorRow = row;
      term.value.selectLines(row, row);
    }, longPressMs);
  }

  function handleTouchMove(event: TouchEvent) {
    event.preventDefault();
    const currentY = event.touches[0].clientY;

    if (selectionAnchorRow !== undefined) {
      extendSelection(currentY);
      return;
    }

    const currentTime = Date.now();
    const deltaY = currentY - lastY;
    const deltaTime = Math.max(currentTime - lastTouchMove, 1);

    lastTouchMove = currentTime;
    lastY = currentY;

    if (Math.abs(currentY - startY) > longPressMoveTolerance) {
      cancelLongPress();
    }

    scrollSpeed = Math.max(-maxScrollSpeed, Math.min(deltaY / deltaTime, maxScrollSpeed));

    if (term.value && deltaTime > 0) {
      const lines = -Math.round(deltaY / 20);
      term.value.scrollLines(lines);
      isScrolling = true;
      debouncedUpdateScrollPosition();
    }
  }

  function handleTouchEnd() {
    cancelLongPress();

    if (selectionAnchorRow !== undefined) {
      // Selection stays after lifting the finger — the copy button picks it up.
      selectionAnchorRow = undefined;
      return;
    }

    // A plain tap outside a selection dismisses it, like native text selection.
    if (!isScrolling && term.value?.hasSelection()) {
      term.value.clearSelection();
    }

    if (isScrolling && Math.abs(scrollSpeed) > 0.2) {
      let currentSpeed = scrollSpeed;

      scrollInterval = setInterval(() => {
        if (!term.value || Math.abs(currentSpeed) < 0.05) {
          clearScrolling();
          return;
        }

        const lines = -Math.round(currentSpeed * scrollLines);
        term.value.scrollLines(lines);
        currentSpeed *= friction;
        debouncedUpdateScrollPosition();
      }, 16);
    }
  }

  element.addEventListener('touchstart', handleTouchStart, { passive: true });
  element.addEventListener('touchmove', handleTouchMove, { passive: false });
  element.addEventListener('touchend', handleTouchEnd, { passive: true });

  onUnmounted(() => {
    element.removeEventListener('touchstart', handleTouchStart);
    element.removeEventListener('touchmove', handleTouchMove);
    element.removeEventListener('touchend', handleTouchEnd);
    cancelLongPress();
    clearScrolling();
  });
}

function safeDispose(addon: Terminal | ITerminalAddon | null) {
  if (addon) {
    try {
      addon.dispose();
    } catch {
      // Ignore
    }
  }
}

watch(
  options,
  () => {
    if (term.value) {
      term.value.options = options.value;
      debouncedResizeHandler();
    }
  },
  { deep: true },
);

watch([terminalContainer.height, terminalContainer.width], () => {
  debouncedResizeHandler();
});

useEventListener(terminalContainerRef, 'pointerenter', () => (isHovering.value = true));
useEventListener(terminalContainerRef, 'pointerleave', () => (isHovering.value = false));
useEventListener(terminalContainerRef, 'contextmenu', handleContextMenu);
useEventListener(document, 'keydown', handleCopyKeydown);

onMounted(() => {
  term.value = new Terminal({
    ...DEFAULT_OPTIONS,
    ...options.value,
  });

  fitAddon = new FitAddon();
  unicode11Addon = new Unicode11Addon();
  webLinksAddon = new WebLinksAddon();

  term.value.loadAddon(unicode11Addon);
  term.value.loadAddon(webLinksAddon);
  term.value.loadAddon(fitAddon);

  term.value.open(terminalContainerRef.value!);

  const textarea = terminalContainerRef.value!.querySelector('textarea');
  if (textarea) {
    textarea.disabled = true;
    textarea.tabIndex = -1;
  }

  term.value.onScroll(() => {
    updateScrollPosition();
  });

  term.value.onSelectionChange(() => {
    hasSelection.value = term.value?.hasSelection() ?? false;
  });

  resizeHandler();
  setupSmoothScrolling();
});

onUnmounted(() => {
  safeDispose(fitAddon);
  safeDispose(unicode11Addon);
  safeDispose(webLinksAddon);
  safeDispose(term.value);
});

defineExpose({
  clearTerminal,
  writeTerminal,
  resizeHandler,
  scrollToBottom,
  copySelection,
  copyAll,
  atBottom,
});
</script>

<style scoped>
:deep(.scrollbar) {
  z-index: 10 !important;
}

:deep(.terminal) {
  height: 100% !important;
  will-change: transform;
  transform: translateZ(0);
}

div :deep(.xterm-scrollable-element),
div :deep(.xterm-screen),
div :deep(.xterm-screen) canvas {
  width: 100% !important;
  height: 100% !important;
}

div :deep(.xterm-scrollable-element) .scrollbar {
  height: 100% !important;
}

div :deep(.xterm-scrollable-element) .scrollbar .slider {
  margin-top: -0.425rem !important;
}

@media screen and (min-width: 640px) {
  div :deep(.xterm-scrollable-element) .scrollbar .slider {
    margin-top: 0 !important;
  }
}

/* div :deep(.xterm-screen),
div :deep(.xterm-rows),
div :deep(.xterm-screen) div {
  width: 100% !important;
}*/

/* :deep(.xterm-screen),
:deep(.xterm-rows) {
  height: 100% !important;
  width: 100% !important;
  contain: content;
} */
</style>
