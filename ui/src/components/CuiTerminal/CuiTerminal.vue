<template>
  <div ref="terminalContainerRef" class="cui-terminal w-full h-full bg-black overflow-hidden p-2 min-w-0" />
</template>

<script setup lang="ts">
import '@xterm/xterm/css/xterm.css';

import { FitAddon } from '@xterm/addon-fit';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';
import { Terminal } from '@xterm/xterm';

import type { ITerminalAddon, ITerminalOptions } from '@xterm/xterm';
import type { CuiTerminalEmits, CuiTerminalProps } from './types.js';

const props = withDefaults(defineProps<CuiTerminalProps>(), {
  autoConnect: true,
  options: () => ({
    fontSize: 14,
  }),
});

const emit = defineEmits<CuiTerminalEmits>();

const { isConnected, isConnecting, isClientConnected, error, connect, write, resize, setPersistent, rename, close, terminate } = useTerminal();

const { options } = toRefs(props);

const DEFAULT_OPTIONS: Partial<ITerminalOptions> = {
  fontSize: 14,
  scrollback: 5000,
  allowTransparency: false,
  disableStdin: false,
  cursorBlink: true,
  allowProposedApi: true,
  theme: {
    background: '#000000',
  },
};

const APPLICATION_CURSOR_MAP: Record<string, string> = {
  '\x1b[A': '\x1bOA', // Up
  '\x1b[B': '\x1bOB', // Down
  '\x1b[C': '\x1bOC', // Right
  '\x1b[D': '\x1bOD', // Left
  '\x1b[H': '\x1bOH', // Home
  '\x1b[F': '\x1bOF', // End
};

const terminalContainerRef = useTemplateRef('terminalContainerRef');
const term = shallowRef<Terminal | null>(null);

let fitAddon: FitAddon | null = null;
let unicode11Addon: Unicode11Addon | null = null;
let webLinksAddon: WebLinksAddon | null = null;
let webglAddon: WebglAddon | null = null;

const terminalContainer = useElementSize(terminalContainerRef);

function handleTerminalData(data: string): void {
  if (isConnected.value) {
    write(props.inputTransform ? props.inputTransform(data) : data);
  }
}

function handlePtyOutput(data: Uint8Array): void {
  if (term.value) {
    term.value.write(data);
  }
}

function fitTerminal(): void {
  if (!term.value || !fitAddon) {
    return;
  }

  try {
    fitAddon.fit();
  } catch {
    // ignore fit errors
  }
}

function resizeHandler(): void {
  fitTerminal();

  if (isConnected.value && term.value) {
    resize({ cols: term.value.cols, rows: term.value.rows });
  }
}

function refreshTerminal(): void {
  if (!term.value) return;

  nextTick(() => {
    fitTerminal();
    term.value?.refresh(0, term.value.rows - 1);
  });
}

const debouncedResizeHandler = useDebounceFn(resizeHandler, 100);

function safeDispose(addon: Terminal | ITerminalAddon | null) {
  if (addon) {
    try {
      addon.dispose();
    } catch {
      // ignore
    }
  }
}

function initTerminal(): void {
  if (!terminalContainerRef.value) return;

  term.value = new Terminal({
    ...DEFAULT_OPTIONS,
    ...options.value,
  });

  fitAddon = new FitAddon();
  webglAddon = new WebglAddon();
  unicode11Addon = new Unicode11Addon();
  webLinksAddon = new WebLinksAddon();

  term.value.loadAddon(unicode11Addon);
  term.value.loadAddon(webLinksAddon);
  term.value.loadAddon(webglAddon);
  term.value.loadAddon(fitAddon);

  term.value.open(terminalContainerRef.value);

  term.value.onData(handleTerminalData);

  term.value.onResize(({ cols, rows }) => {
    if (isConnected.value) {
      resize({ cols, rows });
    }
  });

  webglAddon.onContextLoss(() => {
    safeDispose(webglAddon);
    webglAddon = null;
  });

  resizeHandler();
}

async function connectTerminal(): Promise<void> {
  if (!term.value) return;

  await connect({
    cols: term.value.cols,
    rows: term.value.rows,
    cwd: props.cwd,
    shell: props.shell,
    sessionId: props.sessionId,
    name: props.name,
    persistent: props.persistent,
    onData: handlePtyOutput,
    onReplay: () => term.value?.reset(),
    onSession: (session) => emit('session', session),
    onClose: () => {
      term.value?.write('\r\n\x1b[33mSession closed.\x1b[0m\r\n');
    },
    onError: (err) => {
      emit('error', err);
    },
  });
}

async function disconnectTerminal(): Promise<void> {
  await close();
}

function clearTerminal(): void {
  term.value?.clear();
}

function focusTerminal(): void {
  term.value?.focus();
}

function sendInput(data: string): void {
  if (term.value?.modes.applicationCursorKeysMode) {
    data = APPLICATION_CURSOR_MAP[data] ?? data;
  }
  handleTerminalData(data);
}

watch(
  options,
  () => {
    if (term.value) {
      term.value.options = { ...DEFAULT_OPTIONS, ...options.value };
      debouncedResizeHandler();
    }
  },
  { deep: true },
);

watch(isConnected, (next) => {
  if (next) {
    emit('connected');
  } else {
    emit('disconnected');
  }
});

watch([terminalContainer.height, terminalContainer.width], () => {
  debouncedResizeHandler();
});

onMounted(() => {
  initTerminal();

  if (props.autoConnect) {
    connectTerminal();
  }
});

onUnmounted(() => {
  close();
  safeDispose(fitAddon);
  safeDispose(webglAddon);
  safeDispose(unicode11Addon);
  safeDispose(webLinksAddon);
  safeDispose(term.value);
});

defineExpose({
  connect: connectTerminal,
  disconnect: disconnectTerminal,
  terminate,
  setPersistent,
  rename,
  clear: clearTerminal,
  focus: focusTerminal,
  resize: resizeHandler,
  refresh: refreshTerminal,
  sendInput,
  isConnected,
  isConnecting,
  isClientConnected,
  error,
  term,
});
</script>

<style scoped>
.cui-terminal :deep(.terminal) {
  height: 100% !important;
}

.cui-terminal :deep(.xterm-viewport) {
  overflow-y: auto !important;
}
</style>
