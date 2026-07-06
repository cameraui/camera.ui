import {
  attachBackoff,
  attachCrossTab,
  attachNetworkChange,
  attachPersistence,
  attachPresence,
  attachProbeLoop,
  attachReconnectWatchdog,
  attachTokenLifecycle,
  attachTransportSync,
  attachTransportWatchdog,
  createKernel,
} from '@camera.ui/transport';
import axios from 'axios';

import { createTransports, TRANSPORT_SPECS } from './transports.js';

import type { ConnectionPhase, ConnectionTarget, Persistence, ReducerContext, TokenLifecycle } from '@camera.ui/transport';
import type { Connection, ConnectionOptions } from './types.js';

const DEFAULT_API_PREFIX = '/api';
const PERSIST_STORAGE_KEY = 'camera.ui:connection:target';
const REFRESH_LOCK_KEY = 'camera.ui:refresh';

export function createConnection(options: ConnectionOptions): Connection {
  const apiPrefix = options.apiPrefix ?? DEFAULT_API_PREFIX;
  const logger = options.logger;
  const persistKey = options.storageNamespace ? `${PERSIST_STORAGE_KEY}:${options.storageNamespace}` : PERSIST_STORAGE_KEY;
  const refreshLockKey = options.storageNamespace ? `${REFRESH_LOCK_KEY}:${options.storageNamespace}` : REFRESH_LOCK_KEY;

  const ctx: ReducerContext = { specs: TRANSPORT_SPECS, now: () => Date.now() };
  const kernel = createKernel({ context: ctx });
  const { http, socketio, nats, ws } = createTransports(apiPrefix);

  const phase = shallowRef<ConnectionPhase>(kernel.phase);
  const target = shallowRef<ConnectionTarget | null>(null);

  const lastReachableEndpoint = ref<string | null>(null);
  const cleanups: Array<() => void> = [];

  const troubleSince = ref<number | null>(null);
  const troubleNow = ref(Date.now());
  let troubleTick: ReturnType<typeof setInterval> | undefined;
  const troubleElapsedMs = computed(() => (troubleSince.value === null ? 0 : troubleNow.value - troubleSince.value));

  let restoredTarget: ConnectionTarget | null = null;
  let natsRecovering = false;
  let lastWakeAt = 0;
  const wakeListeners = new Set<() => void>();

  const acquireRefreshLock =
    typeof navigator !== 'undefined' && 'locks' in navigator
      ? <T>(fn: () => Promise<T>): Promise<T> => navigator.locks.request(refreshLockKey, fn) as Promise<T>
      : undefined;

  const persistence: Persistence = attachPersistence({
    kernel,
    storage: options.adapters.storage,
    key: persistKey,
    onRestore: (restored) => {
      restoredTarget = restored;
      logger?.debug('persistence', restored ? `restored — ${restored.endpoint.url}` : 'no stored target');
    },
    onPersist: (t) => logger?.debug('persistence', `persisted — ${t.endpoint.url}`),
    onClear: () => logger?.debug('persistence', 'cleared'),
    onError: (op, err) => logger?.warn('persistence', `${op} error`, err),
  });
  cleanups.push(persistence.detach);

  // Give the refresh coordinator the same cross-tab lock the token lifecycle
  // uses plus a live view of the persisted tokens — the probe's 401-refresh
  // otherwise races other tabs with an already-rotated refresh token.
  options.callbacks.bindRefresh?.({
    acquireLock: acquireRefreshLock ?? (async (fn) => fn()),
    getLatestTokens: () => persistence.peek()?.tokens ?? null,
  });

  cleanups.push(
    attachCrossTab({
      kernel,
      key: persistKey,
      absorb: (t) => persistence.absorb(t),
      onTokensReceived: () => {
        logger?.debug('cross-tab', 'tokens received from another tab');
        // Another tab just logged in / switched instance while we sit in a
        // dead-end phase — the fresh tokens are in persistence (absorb), so
        // a retry gets this tab back online without a manual reload.
        const k = kernel.phase.kind;
        if (k === 'needs-auth' || k === 'offline') {
          kernel.dispatch({ type: 'USER_RETRY' });
        } else if (k === 'idle') {
          kernel.dispatch({ type: 'BOOT', instanceId: 'default' });
        }
      },
      onResetReceived: () => logger?.debug('cross-tab', 'logout received from another tab'),
      onError: (op, err) => logger?.warn('cross-tab', `${op} error`, err),
    }),
  );

  cleanups.push(
    kernel.subscribe((next, prev, action) => {
      phase.value = next;
      logger?.debug('kernel', `${prev.kind} → ${next.kind}`, { action: action.type });

      if (next.kind === 'idle' && prev.kind !== 'idle') {
        options.callbacks.onConnectionReset?.();
      }

      if (next.kind === 'online') recoverNatsIfStale();

      if (next.kind === 'online' || next.kind === 'idle' || next.kind === 'needs-auth') {
        troubleSince.value = null;
        if (troubleTick !== undefined) {
          clearInterval(troubleTick);
          troubleTick = undefined;
        }
      } else if (troubleSince.value === null) {
        troubleSince.value = Date.now();
        troubleNow.value = troubleSince.value;
        troubleTick = setInterval(() => {
          troubleNow.value = Date.now();
        }, 1_000);
      }
    }),
  );
  cleanups.push(() => {
    if (troubleTick !== undefined) {
      clearInterval(troubleTick);
      troubleTick = undefined;
    }
  });

  cleanups.push(
    attachTransportSync({
      kernel,
      transports: [http, socketio, nats, ws],
      onApplied: (t) => {
        target.value = t;
        if (t) restoredTarget = null;
        else if (kernel.phase.kind === 'idle' || kernel.phase.kind === 'needs-auth') restoredTarget = null;
      },
      onError: (transport, _t, err) => logger?.error(transport.spec.id, 'apply failed', err),
    }),
  );

  cleanups.push(
    attachTransportWatchdog({
      kernel,
      transports: [socketio, nats],
      onGraceStarted: (id, ms) => logger?.debug('watchdog', `${id}: grace ${ms}ms`),
      onGraceCleared: (id, reason) => logger?.debug('watchdog', `${id}: grace cleared (${reason})`),
      onConfirmed: (id) => logger?.debug('watchdog', `${id}: DOWN CONFIRMED`),
    }),
  );

  cleanups.push(
    attachReconnectWatchdog({
      kernel,
      onEscalate: (attempt) => logger?.debug('reconnect-watchdog', `still reconnecting — escalating to re-discover (#${attempt})`),
    }),
  );

  cleanups.push(
    attachBackoff({
      kernel,
      schedule: [5_000],
      firstAttemptDelayMs: () => (Date.now() - lastWakeAt < 15_000 ? 1_500 : null),
      onScheduled: (attempt, delayMs) => logger?.debug('backoff', `attempt #${attempt} in ${Math.round(delayMs / 1000)}s`),
      onFire: (attempt) => logger?.debug('backoff', `firing #${attempt}`),
      onCancelled: (reason) => logger?.debug('backoff', `cancelled (${reason})`),
    }),
  );

  function wakeTokens(): void {
    lastWakeAt = Date.now();
    lifecycle?.wake();
    options.callbacks.onWake?.();
    natsHeartbeat();
    for (const listener of wakeListeners) {
      try {
        listener();
      } catch {
        // ignore
      }
    }
  }

  async function natsHeartbeat(): Promise<void> {
    if (!nats.health().up) return;
    try {
      await nats.probeAlive(3_000);
    } catch {
      try {
        await nats.forceReconnect();
      } catch {
        // forceReconnect failures surface via the status iterator's down event
      }
    }
  }

  function recoverNatsIfStale(): void {
    if (natsRecovering) return;
    natsRecovering = true;
    queueMicrotask(() => {
      if (kernel.phase.kind !== 'online') {
        natsRecovering = false;
        return;
      }
      if (!nats.health().up) {
        logger?.debug('nats', 'main-thread nats down at online — forcing reconnect');
        nats.forceReconnect().catch(() => {});
        return;
      }
      nats.probeAlive(3_000).then(
        () => (natsRecovering = false),
        () => {
          logger?.debug('nats', 'main-thread nats stale at online — forcing reconnect');
          nats.forceReconnect().catch(() => {});
        },
      );
    });
  }

  function shouldRetryOnWake(): boolean {
    const phase = kernel.phase.kind;
    if (phase === 'offline' || phase === 'reconnecting') return true;
    return phase === 'online' && !nats.health().up;
  }

  cleanups.push(nats.on('up', () => (natsRecovering = false)));

  cleanups.push(
    attachPresence({
      kernel,
      visibilitySource: options.adapters.visibilitySource,
      networkSource: options.adapters.networkSource,
      onOnline: (k) => {
        logger?.debug('presence', 'network online');
        wakeTokens();
        if (shouldRetryOnWake()) k.dispatch({ type: 'USER_RETRY' });
      },
      onOffline: () => logger?.debug('presence', 'network offline'),
      onVisibilityVisible: (k) => {
        logger?.debug('presence', 'tab visible');
        wakeTokens();
        socketio.reviveDeadSockets();
        if (shouldRetryOnWake()) k.dispatch({ type: 'USER_RETRY' });
      },
      onVisibilityHidden: () => logger?.debug('presence', 'tab hidden'),
    }),
  );

  if (options.adapters.networkChangeSource) {
    cleanups.push(
      attachNetworkChange({
        kernel,
        source: options.adapters.networkChangeSource,
        onChange: (k) => {
          logger?.debug('network-change', 'connection type changed');
          wakeTokens();
          // Re-discover unconditionally on every network-type change when we're in any active phase.
          if (k.phase.kind === 'online' || k.phase.kind === 'reconnecting' || k.phase.kind === 'offline') {
            logger?.debug('network-change', 're-discovering');
            k.dispatch({ type: 'USER_RETRY' });
          }
        },
      }),
    );
  }

  const lifecycle: TokenLifecycle = attachTokenLifecycle({
    kernel,
    transports: [http, nats, socketio, ws],
    graceMs: 5_000,
    maxTransientRetries: 5,
    transientRetryDelayMs: 2_000,
    isTransientError: (err) => {
      if (axios.isAxiosError(err)) {
        if (!err.response) return true;
        if (err.response.status >= 500) return true;
      }
      return false;
    },
    refresh: options.callbacks.refresh,
    acquireRefreshLock,
    getLatestTokens: () => persistence.peek()?.tokens ?? null,
    onRefreshStart: (reason) => logger?.debug('token-lifecycle', `refresh START (${reason})`),
    onRefreshSuccess: (reason, tokens) => {
      const exp = tokens.accessExpiresAt;
      const expIn = typeof exp === 'number' ? Math.round((exp - Date.now()) / 1000) : '?';
      logger?.debug('token-lifecycle', `refresh OK (${reason}) — new exp in ${expIn}s`);
    },
    onRefreshSkipped: (reason) => logger?.debug('token-lifecycle', `refresh SKIPPED (${reason}) — another tab won`),
    onRefreshError: (reason, err, info) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (info.willRetry) logger?.warn('token-lifecycle', `refresh transient (${reason}) — ${msg}`);
      else if (info.transient) logger?.error('token-lifecycle', `refresh transient exhausted (${reason}) — ${msg}`);
      else logger?.error('token-lifecycle', `refresh permanent (${reason}) — ${msg}`);
    },
    onScheduled: (delayMs, expiresAt) => {
      const inSec = Math.round(delayMs / 1000);
      const expSec = Math.round((expiresAt - Date.now()) / 1000);
      logger?.debug('token-lifecycle', `scheduled refresh in ${inSec}s (exp in ${expSec}s)`);
    },
    onWakeChecked: (info) => {
      const remaining = typeof info.remainingMs === 'number' ? `${Math.round(info.remainingMs / 1000)}s` : 'n/a';
      logger?.debug('token-lifecycle', `wake() → ${info.decision} (phase=${info.phase}, remaining=${remaining})`);
    },
    onTriggerSkipped: (reason, why, phase) => {
      logger?.debug('token-lifecycle', `trigger SKIP (${reason}) — ${why} (phase=${phase})`);
    },
  });
  cleanups.push(() => lifecycle.detach());

  cleanups.push(
    attachProbeLoop({
      kernel,
      discover: options.callbacks.discover,
      probe: options.callbacks.probe,
      lastTarget: () => target.value ?? restoredTarget ?? persistence.peek(),
      onDiscoverStart: () => logger?.debug('probe', 'discover start'),
      onDiscoverSuccess: (pool) => logger?.debug('probe', `discover OK — pool=${pool.length}`),
      onDiscoverError: (err) => logger?.error('probe', 'discover FAILED', err),
      onProbeStart: (ep) => logger?.debug('probe', `probe ${ep.url}`),
      onProbeSuccess: (ep) => {
        lastReachableEndpoint.value = ep.url;
        logger?.debug('probe', `probe OK — ${ep.url}`);
      },
      onProbeError: (ep, err) => {
        const msg = err instanceof Error ? err.message : String(err);
        const kind = err instanceof Error && 'kind' in err ? (err as { kind: string }).kind : 'unknown';
        // `needs-auth` from probe.ts now means the host actually answered
        // (401 / Bearer rejected) — it's a reachability signal. `fatal` is
        // also a successful round-trip (server-confirmed dead-end). Capture
        // those as known-good hosts; only ignore `transient` / `aborted`
        // failures, which mean the network never got there.
        if (kind === 'needs-auth' || kind === 'fatal') {
          lastReachableEndpoint.value = ep.url;
        }
        logger?.warn('probe', `probe FAIL ${ep.url} — [${kind}] ${msg}`);
      },
      onAllFailed: (reason) => logger?.error('probe', `all probes failed — ${reason}`),
    }),
  );

  function boot(instanceId: string): void {
    kernel.dispatch({ type: 'BOOT', instanceId });
  }

  function retry(): void {
    kernel.dispatch({ type: 'USER_RETRY' });
  }

  function reset(): void {
    kernel.dispatch({ type: 'RESET' });
  }

  async function seedAndRetry(seedTarget: ConnectionTarget, instanceId = 'default'): Promise<void> {
    await persistence.seed(seedTarget);
    // The boot-time `restoredTarget` may still hold stale tokens (e.g. the
    // ones that just got us into needs-auth). Drop it so probe-loop's
    // `lastTarget` chain falls through to `persistence.peek()` and reads the
    // freshly seeded target.
    restoredTarget = null;
    const kind = kernel.phase.kind;
    if (kind === 'idle' || kind === 'offline' || kind === 'needs-auth') {
      if (kind === 'idle') {
        kernel.dispatch({ type: 'BOOT', instanceId });
      } else {
        kernel.dispatch({ type: 'USER_RETRY' });
      }
    } else if (kind === 'online' || kind === 'reconnecting') {
      // Without this the seeded tokens only reach persistence — the live
      // target and transports keep the old ones until the next refresh.
      kernel.dispatch({ type: 'TOKENS_REFRESHED', tokens: seedTarget.tokens });
    }
  }

  async function detach(): Promise<void> {
    for (const fn of cleanups.splice(0)) {
      try {
        fn();
      } catch (err) {
        logger?.warn('connection', 'cleanup error', err);
      }
    }
    await Promise.allSettled([http.dispose(), socketio.dispose(), nats.dispose(), ws.dispose()]);
    kernel.dispose();
  }

  function whenOnline(opts?: { timeoutMs?: number; signal?: AbortSignal }): Promise<boolean> {
    if (kernel.phase.kind === 'online') return Promise.resolve(true);
    if (opts?.signal?.aborted) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      let done = false;
      let unsub: () => void = () => {};
      const settle = (value: boolean): void => {
        if (done) return;
        done = true;
        unsub();
        resolve(value);
      };
      unsub = kernel.subscribe((next) => {
        if (next.kind === 'online') settle(true);
      });
      if (opts?.timeoutMs !== undefined) setTimeout(() => settle(false), opts.timeoutMs);
      opts?.signal?.addEventListener('abort', () => settle(false), { once: true });
    });
  }

  function onWakeListener(listener: () => void): () => void {
    wakeListeners.add(listener);
    return () => wakeListeners.delete(listener);
  }

  return {
    kernel,
    phase,
    target,
    http,
    socketio,
    nats,
    ws,
    lastReachableEndpoint,
    troubleElapsedMs,
    boot,
    retry,
    reset,
    detach,
    seedAndRetry,
    onWake: onWakeListener,
    whenOnline,
  };
}
