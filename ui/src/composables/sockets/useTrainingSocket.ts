import type { SocketChannel } from '@/connection/index.js';
import type { TrainingSubmitProgress } from '@shared/types';

const state = reactive<{ progress: TrainingSubmitProgress | null }>({ progress: null });

let scope: ReturnType<typeof effectScope> | null = null;
let channel: SocketChannel | null = null;
const changeListeners = new Set<() => void>();

function notifyChanged(): void {
  for (const listener of changeListeners) {
    try {
      listener();
    } catch {
      // listener errors stay local
    }
  }
}

async function loadProgress(): Promise<void> {
  if (!channel?.ready.value) return;
  try {
    const progress = await channel.request<TrainingSubmitProgress>('get-submit-progress');
    if (progress.active) state.progress = progress;
  } catch {
    // server unreachable
  }
}

function ensureChannel(): SocketChannel {
  if (channel) return channel;

  scope = effectScope(true);
  scope.run(() => {
    const ch = useSocket('/training');
    channel = ch;

    ch.on('candidates-changed', () => notifyChanged());

    ch.on<TrainingSubmitProgress>('submit-progress', (progress) => {
      state.progress = progress;
      notifyChanged();
    });

    ch.onReady(() => {
      loadProgress();
      notifyChanged();
    });
  });

  return channel!;
}

export function useTrainingSocket() {
  function connect(): void {
    ensureChannel();
  }

  function onCandidatesChanged(listener: () => void): () => void {
    changeListeners.add(listener);
    return () => changeListeners.delete(listener);
  }

  function dismissProgress(): void {
    state.progress = null;
  }

  return {
    submitProgress: computed(() => state.progress),
    connect,
    onCandidatesChanged,
    dismissProgress,
  };
}

export function resetTrainingSocket(): void {
  scope?.stop();
  scope = null;
  channel = null;
  state.progress = null;
  changeListeners.clear();
}
