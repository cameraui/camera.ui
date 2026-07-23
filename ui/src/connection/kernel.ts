import {
  attachBackoff,
  attachCrossTab,
  attachDegradedRecovery,
  attachNetworkChange,
  attachPersistence,
  attachPresence,
  attachProbeLoop,
  attachTokenLifecycle,
  attachTransportSync,
  createBackgroundProbe,
  createConnectionJournal,
  createConnectionSignal,
  createKernel,
} from '@camera.ui/transport';
import axios from 'axios';

import { createTransports } from './transports.js';

import type { ConnectionPhase, ConnectionSignal, ConnectionTarget, Persistence, ReducerContext, TokenLifecycle } from '@camera.ui/transport';
import type { Connection, ConnectionOptions } from './types.js';

const DEFAULT_API_PREFIX = '/api';
const PERSIST_STORAGE_KEY = 'camera.ui:connection:target';
const REFRESH_LOCK_KEY = 'camera.ui:refresh';

export function createConnection(options: ConnectionOptions): Connection {
  const apiPrefix = options.apiPrefix ?? DEFAULT_API_PREFIX;
  const logger = options.logger;
  const persistKey = options.storageNamespace ? `${PERSIST_STORAGE_KEY}:${options.storageNamespace}` : PERSIST_STORAGE_KEY;
  const refreshLockKey = options.storageNamespace ? `${REFRESH_LOCK_KEY}:${options.storageNamespace}` : REFRESH_LOCK_KEY;

  const journal = createConnectionJournal();

  function diag(scope: string, msg: string, detail?: unknown, level: 'debug' | 'warn' | 'error' = 'debug'): void {
    journal.record(scope, msg, detail);
    if (detail === undefined) logger?.[level](scope, msg);
    else logger?.[level](scope, msg, detail);
  }

  const ctx: ReducerContext = { now: () => Date.now() };
  const kernel = createKernel({
    context: ctx,
    onAction: (action, prev, next) => {
      if (next === prev) journal.record('kernel', `${action.type} dropped`, `phase=${prev.kind}`);
    },
  });
  const { http, socketio, nats, ws } = createTransports(apiPrefix);

  const phase = shallowRef<ConnectionPhase>(kernel.phase);
  const target = shallowRef<ConnectionTarget | null>(null);

  const signalHandle = createConnectionSignal({ kernel, transports: [socketio, nats] });
  const signal = shallowRef<ConnectionSignal>(signalHandle.current);

  const lastReachableEndpoint = ref<string | null>(null);
  const cleanups: Array<() => void> = [];

  const troubleSince = ref<number | null>(null);
  const troubleNow = ref(Date.now());
  let troubleTick: ReturnType<typeof setInterval> | undefined;
  const troubleElapsedMs = computed(() => (troubleSince.value === null ? 0 : troubleNow.value - troubleSince.value));

  const hasBeenOnline = ref(false);

  let restoredTarget: ConnectionTarget | null = null;
  let lastWakeAt = 0;
  let pendingBackoffHintMs: number | null = null;

  function captureRetryAfter(err: unknown): void {
    const candidate = axios.isAxiosError(err) ? err : err instanceof Error && axios.isAxiosError(err.cause) ? err.cause : null;
    if (!candidate || candidate.response?.status !== 503) return;
    const raw = candidate.response.headers?.['retry-after'];
    const seconds = Number.parseInt(String(raw ?? ''), 10);
    if (Number.isFinite(seconds) && seconds > 0) pendingBackoffHintMs = seconds * 1000;
  }
  const wakeListeners = new Set<() => void>();

  for (const transport of [http, socketio, nats, ws]) {
    const id = transport.spec.id;
    cleanups.push(transport.on('up', () => journal.record(id, 'up')));
    cleanups.push(transport.on('down', ({ reason }) => journal.record(id, 'down', reason)));
    cleanups.push(transport.on('auth-error', (payload) => journal.record(id, 'auth-error', payload?.message ?? payload?.status)));
  }

  cleanups.push(
    signalHandle.subscribe((next) => {
      signal.value = next;
      journal.record('signal', next.kind, next.kind === 'degraded' ? next.channels.join(',') : undefined);
    }),
  );
  cleanups.push(() => signalHandle.dispose());

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
      diag('persistence', restored ? `restored — ${restored.endpoint.url}` : 'no stored target');
    },
    onPersist: (t) => diag('persistence', `persisted — ${t.endpoint.url}`),
    onClear: () => diag('persistence', 'cleared'),
    onError: (op, err) => diag('persistence', `${op} error`, err, 'warn'),
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
        diag('cross-tab', 'tokens received from another tab');
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
      onResetReceived: () => diag('cross-tab', 'logout received from another tab'),
      onError: (op, err) => diag('cross-tab', `${op} error`, err, 'warn'),
    }),
  );

  cleanups.push(
    kernel.subscribe((next, prev, action) => {
      phase.value = next;
      diag('kernel', `${prev.kind} → ${next.kind}`, action.type);

      if (next.kind === 'idle' && prev.kind !== 'idle') {
        options.callbacks.onConnectionReset?.();
      }

      if (next.kind === 'online') hasBeenOnline.value = true;
      else if (next.kind === 'idle') hasBeenOnline.value = false;

      if (next.kind === 'offline' && pendingBackoffHintMs !== null) {
        const ms = pendingBackoffHintMs;
        pendingBackoffHintMs = null;
        diag('backoff', `server hint: retry after ${Math.round(ms / 1000)}s`);
        queueMicrotask(() => kernel.dispatch({ type: 'BACKOFF_HINT', retryAfterMs: ms, source: 'retry-after' }));
      } else if (next.kind === 'online') {
        pendingBackoffHintMs = null;
      }

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
      onError: (transport, _t, err) => diag(transport.spec.id, 'apply failed', err, 'error'),
    }),
  );

  cleanups.push(
    attachBackoff({
      kernel,
      schedule: [5_000],
      firstAttemptDelayMs: () => (Date.now() - lastWakeAt < 15_000 ? 1_500 : null),
      onScheduled: (attempt, delayMs) => diag('backoff', `attempt #${attempt} in ${Math.round(delayMs / 1000)}s`),
      onFire: (attempt) => diag('backoff', `firing #${attempt}`),
      onCancelled: (reason) => diag('backoff', `cancelled (${reason})`),
    }),
  );

  function wakeTokens(): void {
    lastWakeAt = Date.now();
    lifecycle?.wake();
    options.callbacks.onWake?.();
    ensureTransportsAlive();
    for (const listener of wakeListeners) {
      try {
        listener();
      } catch {
        // ignore
      }
    }
  }

  function ensureTransportsAlive(): void {
    for (const transport of [nats, socketio] as const) {
      const before = transport.health();
      transport
        .ensureAlive()
        .then((after) => {
          if (before.up !== after.up || !after.up) {
            journal.record(transport.spec.id, `ensureAlive → ${after.up ? 'up' : 'down'}`, after.lastError ?? before.lastError);
          }
        })
        .catch(() => {});
    }
  }

  function shouldRetryOnWake(): boolean {
    return kernel.phase.kind === 'offline';
  }

  const backgroundProbe = createBackgroundProbe({
    kernel,
    discover: options.callbacks.discover,
    probe: options.callbacks.probe,
    lastTarget: () => target.value ?? restoredTarget ?? persistence.peek(),
    prefer: (ep) => ep.mode === 'direct-lan',
    onResult: (outcome, detail) => diag('probe', `background ${outcome}`, detail),
  });
  cleanups.push(() => backgroundProbe.dispose());

  cleanups.push(
    attachDegradedRecovery({
      kernel,
      signal: signalHandle,
      ensureAll: ensureTransportsAlive,
      probe: () => backgroundProbe.run(),
      onEscalate: (round) => diag('degraded-recovery', `round #${round}`),
      onOffline: (reason) => diag('degraded-recovery', reason, undefined, 'warn'),
    }),
  );

  cleanups.push(
    attachPresence({
      kernel,
      visibilitySource: options.adapters.visibilitySource,
      networkSource: options.adapters.networkSource,
      onOnline: (k) => {
        diag('presence', 'network online');
        wakeTokens();
        if (shouldRetryOnWake()) k.dispatch({ type: 'USER_RETRY' });
        else if (k.phase.kind === 'online') void backgroundProbe.run();
      },
      onOffline: () => diag('presence', 'network offline'),
      onVisibilityVisible: (k) => {
        diag('presence', 'tab visible');
        wakeTokens();
        if (shouldRetryOnWake()) k.dispatch({ type: 'USER_RETRY' });
      },
      onVisibilityHidden: () => diag('presence', 'tab hidden'),
    }),
  );

  if (options.adapters.networkChangeSource) {
    cleanups.push(
      attachNetworkChange({
        kernel,
        source: options.adapters.networkChangeSource,
        onChange: (k) => {
          diag('network-change', 'connection type changed');
          wakeTokens();
          // healthy connections stay online: probe silently and swap the
          // endpoint in place if the new network opened a better path
          if (k.phase.kind === 'online') {
            void backgroundProbe.run();
          } else if (k.phase.kind === 'offline') {
            diag('network-change', 're-discovering');
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
    onRefreshStart: (reason) => diag('token-lifecycle', `refresh START (${reason})`),
    onRefreshSuccess: (reason, tokens) => {
      const exp = tokens.accessExpiresAt;
      const expIn = typeof exp === 'number' ? Math.round((exp - Date.now()) / 1000) : '?';
      diag('token-lifecycle', `refresh OK (${reason}) — new exp in ${expIn}s`);
    },
    onRefreshSkipped: (reason) => diag('token-lifecycle', `refresh SKIPPED (${reason}) — another tab won`),
    onRefreshError: (reason, err, info) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (info.willRetry) diag('token-lifecycle', `refresh transient (${reason}) — ${msg}`, undefined, 'warn');
      else if (info.transient) diag('token-lifecycle', `refresh transient exhausted (${reason}) — ${msg}`, undefined, 'error');
      else diag('token-lifecycle', `refresh permanent (${reason}) — ${msg}`, undefined, 'error');
    },
    onScheduled: (delayMs, expiresAt) => {
      const inSec = Math.round(delayMs / 1000);
      const expSec = Math.round((expiresAt - Date.now()) / 1000);
      diag('token-lifecycle', `scheduled refresh in ${inSec}s (exp in ${expSec}s)`);
    },
    onWakeChecked: (info) => {
      const remaining = typeof info.remainingMs === 'number' ? `${Math.round(info.remainingMs / 1000)}s` : 'n/a';
      diag('token-lifecycle', `wake() → ${info.decision} (phase=${info.phase}, remaining=${remaining})`);
    },
    onTriggerSkipped: (reason, why, phase) => {
      diag('token-lifecycle', `trigger SKIP (${reason}) — ${why} (phase=${phase})`);
    },
  });
  cleanups.push(() => lifecycle.detach());

  cleanups.push(
    attachProbeLoop({
      kernel,
      discover: options.callbacks.discover,
      probe: options.callbacks.probe,
      prefer: (ep) => ep.mode === 'direct-lan',
      lastTarget: () => target.value ?? restoredTarget ?? persistence.peek(),
      onDiscoverStart: () => diag('probe', 'discover start'),
      onDiscoverSuccess: (pool) => diag('probe', `discover OK — pool=${pool.length}`),
      onDiscoverError: (err) => {
        captureRetryAfter(err);
        diag('probe', 'discover FAILED', err, 'error');
      },
      onProbeStart: (ep) => diag('probe', `probe ${ep.url}`),
      onProbeSuccess: (ep) => {
        lastReachableEndpoint.value = ep.url;
        diag('probe', `probe OK — ${ep.url}`);
      },
      onProbeError: (ep, err) => {
        captureRetryAfter(err);
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
        diag('probe', `probe FAIL ${ep.url} — [${kind}] ${msg}`, undefined, 'warn');
      },
      onAllFailed: (reason) => diag('probe', `all probes failed — ${reason}`, undefined, 'error'),
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
    } else if (kind === 'online') {
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
    journal,
    phase,
    signal,
    target,
    http,
    socketio,
    nats,
    ws,
    lastReachableEndpoint,
    troubleElapsedMs,
    hasBeenOnline,
    boot,
    retry,
    reset,
    detach,
    seedAndRetry,
    onWake: onWakeListener,
    whenOnline,
  };
}
