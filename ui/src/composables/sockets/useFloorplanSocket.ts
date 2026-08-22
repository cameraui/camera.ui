import type { SocketChannel } from '@/connection/index.js';
import type { DBFloorPlan } from '@shared/types';

const state = reactive<{ plan: DBFloorPlan | null }>({ plan: null });

let scope: ReturnType<typeof effectScope> | null = null;
let channel: SocketChannel | null = null;
const listeners = new Set<(plan: DBFloorPlan) => void>();

function ensureChannel(): void {
  if (channel) return;

  scope = effectScope(true);
  scope.run(() => {
    const ch = useSocket('/camera.ui');
    channel = ch;

    ch.on<DBFloorPlan>('floorplan-changed', (plan) => {
      state.plan = plan;
      for (const listener of listeners) {
        try {
          listener(plan);
        } catch {
          // ignore
        }
      }
    });
  });
}

export function useFloorplanSocket() {
  function connect(): void {
    ensureChannel();
  }

  function onPlan(listener: (plan: DBFloorPlan) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return {
    plan: computed(() => state.plan),
    connect,
    onPlan,
  };
}

export function resetFloorplanSocket(): void {
  scope?.stop();
  scope = null;
  channel = null;
  listeners.clear();
  state.plan = null;
}
