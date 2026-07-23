import { getConnection } from '../instance.js';

import type { ConnectionPhase, ConnectionSignal, ConnectionTarget } from '@camera.ui/transport';
import type { ComputedRef, Ref, ShallowRef } from 'vue';

export type BannerMode = 'connecting' | 'reconnecting' | 'degraded' | null;

export interface UseConnectionReturn {
  readonly phase: ShallowRef<ConnectionPhase>;
  readonly signal: ShallowRef<ConnectionSignal>;
  readonly target: Ref<ConnectionTarget | null>;

  readonly endpoint: ComputedRef<string | undefined>;
  readonly accessToken: ComputedRef<string | undefined>;
  readonly proxySession: ComputedRef<string | undefined>;
  readonly instanceId: ComputedRef<string | null>;

  readonly isIdle: ComputedRef<boolean>;
  readonly isDiscovering: ComputedRef<boolean>;
  readonly isOnline: ComputedRef<boolean>;
  readonly isNeedsAuth: ComputedRef<boolean>;
  readonly isOffline: ComputedRef<boolean>;
  readonly bannerMode: ComputedRef<BannerMode>;
  readonly inTrouble: ComputedRef<boolean>;
  readonly nextRetryAt: ComputedRef<number | null>;
  readonly offlineReason: ComputedRef<string | null>;

  boot(instanceId: string): void;
  retry(): void;
  reset(): void;
}

const IN_TROUBLE_MS = 30_000;

export function useConnection(): UseConnectionReturn {
  const connection = getConnection();

  const endpoint = computed(() => connection.target.value?.endpoint.url);
  const accessToken = computed(() => connection.target.value?.tokens.access);
  const proxySession = computed(() => connection.target.value?.tokens.proxySession);

  const instanceId = computed(() => {
    const p = connection.phase.value;
    if (p.kind === 'idle') return null;
    return p.instanceId;
  });

  const isIdle = computed(() => connection.phase.value.kind === 'idle');
  const isDiscovering = computed(() => connection.phase.value.kind === 'discovering');
  const isOnline = computed(() => connection.phase.value.kind === 'online');
  const isNeedsAuth = computed(() => connection.phase.value.kind === 'needs-auth');
  const isOffline = computed(() => connection.phase.value.kind === 'offline');

  const bannerMode = computed<BannerMode>(() => {
    const s = connection.signal.value;
    if (s.kind === 'connecting') return connection.hasBeenOnline.value ? 'reconnecting' : 'connecting';
    if (s.kind === 'offline') return 'reconnecting';
    if (s.kind === 'degraded') return 'degraded';
    return null;
  });

  const inTrouble = computed(() => connection.troubleElapsedMs.value >= IN_TROUBLE_MS);

  const nextRetryAt = computed(() => {
    const p = connection.phase.value;
    return p.kind === 'offline' ? p.nextRetryAt : null;
  });

  const offlineReason = computed(() => {
    const p = connection.phase.value;
    return p.kind === 'offline' ? p.lastError : null;
  });

  return {
    phase: connection.phase,
    signal: connection.signal,
    target: connection.target,
    endpoint,
    accessToken,
    proxySession,
    instanceId,
    isIdle,
    isDiscovering,
    isOnline,
    isNeedsAuth,
    isOffline,
    bannerMode,
    inTrouble,
    nextRetryAt,
    offlineReason,
    boot: (id) => connection.boot(id),
    retry: () => connection.retry(),
    reset: () => connection.reset(),
  };
}
