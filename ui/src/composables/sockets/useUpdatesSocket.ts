import type { SocketChannel } from '@/connection/index.js';
import type { UpdatesItemKind, UpdatesItemStatus } from '@shared/types';

export interface PublicUpdatesStatus {
  updating: boolean;
  runActive: boolean;
  items: { kind: UpdatesItemKind; name: string; displayName?: string; status: UpdatesItemStatus }[];
}

const state = reactive<{ status: PublicUpdatesStatus | null }>({ status: null });

let scope: ReturnType<typeof effectScope> | null = null;
let channel: SocketChannel | null = null;
const statusListeners = new Set<() => void>();

function ensureChannel(): SocketChannel {
  if (channel) return channel;

  scope = effectScope(true);
  scope.run(() => {
    const ch = useSocket('/camera.ui');
    channel = ch;

    ch.on<PublicUpdatesStatus>('updates-status', (status) => {
      state.status = status;
      for (const listener of statusListeners) {
        try {
          listener();
        } catch {
          // listener errors stay local
        }
      }
    });

    ch.onReady(() => {
      for (const listener of statusListeners) {
        try {
          listener();
        } catch {
          // listener errors stay local
        }
      }
    });
  });

  return channel!;
}

export function useUpdatesSocket() {
  function connect(): void {
    ensureChannel();
  }

  function onStatus(listener: () => void): () => void {
    statusListeners.add(listener);
    return () => statusListeners.delete(listener);
  }

  return {
    status: computed(() => state.status),
    connect,
    onStatus,
  };
}

export function resetUpdatesSocket(): void {
  scope?.stop();
  scope = null;
  channel = null;
  state.status = null;
  statusListeners.clear();
}
