import { tryOnScopeDispose } from '@vueuse/core';

import { getConnection } from '../instance.js';

import type { Socket } from '@camera.ui/transport/transports/socketio';
import type { ComputedRef, ShallowRef } from 'vue';

export type SocketEventHandler<TPayload = unknown> = (payload: TPayload) => void;
export type SocketUnsubscribe = () => void;

export interface SocketRequestOptions {
  readonly timeoutMs?: number;
}

export interface SocketChannel {
  readonly connected: ShallowRef<boolean>;
  readonly ready: ComputedRef<boolean>;
  on<TPayload = unknown>(event: string, handler: SocketEventHandler<TPayload>): SocketUnsubscribe;
  onReady(handler: () => void): SocketUnsubscribe;
  emit(event: string, ...args: unknown[]): void;
  request<TRes = unknown>(event: string, payload?: unknown, options?: SocketRequestOptions): Promise<TRes>;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

export function useSocket(namespace: string): SocketChannel {
  const connection = getConnection();
  const connected = shallowRef(false);
  const ready = computed(() => connected.value);

  let socket: Socket | null = null;
  const handlers = new Map<string, Set<SocketEventHandler>>();

  function handleConnect(): void {
    connected.value = true;
  }

  function handleDisconnect(): void {
    connected.value = false;
  }

  function attach(s: Socket): void {
    socket = s;
    connected.value = s.connected;
    s.on('connect', handleConnect);
    s.on('disconnect', handleDisconnect);
    for (const [event, set] of handlers) {
      for (const handler of set) {
        s.on(event, handler as (...args: unknown[]) => void);
      }
    }
  }

  function detach(): void {
    if (socket) {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      for (const [event, set] of handlers) {
        for (const handler of set) {
          socket.off(event, handler as (...args: unknown[]) => void);
        }
      }
      socket = null;
    }
    connected.value = false;
  }

  const stop = watch(
    () => connection.target.value?.endpoint.url,
    (url) => {
      detach();
      if (url) {
        const s = connection.socketio.ensureSocket(namespace);
        if (s) attach(s);
      }
    },
    { immediate: true },
  );

  tryOnScopeDispose(() => {
    stop();
    detach();
    handlers.clear();
  });

  function on<TPayload = unknown>(event: string, handler: SocketEventHandler<TPayload>): SocketUnsubscribe {
    let set = handlers.get(event);
    if (!set) {
      set = new Set();
      handlers.set(event, set);
    }
    set.add(handler as SocketEventHandler);
    socket?.on(event, handler as (...args: unknown[]) => void);

    return () => {
      set!.delete(handler as SocketEventHandler);
      socket?.off(event, handler as (...args: unknown[]) => void);
    };
  }

  function onReady(handler: () => void): SocketUnsubscribe {
    return watch(
      connected,
      (isConnected, was) => {
        if (isConnected && !was) handler();
      },
      { immediate: true },
    );
  }

  function emit(event: string, ...args: unknown[]): void {
    socket?.emit(event, ...args);
  }

  function request<TRes = unknown>(event: string, payload?: unknown, options?: SocketRequestOptions): Promise<TRes> {
    const s = socket;
    if (!s || !s.connected) {
      return Promise.reject(new Error(`socket "${namespace}" not connected`));
    }
    const timeoutMs = options?.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    return new Promise<TRes>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`socket "${namespace}" request timeout: ${event}`)), timeoutMs);
      s.emit(event, payload, (response: unknown) => {
        clearTimeout(timer);
        resolve(response as TRes);
      });
    });
  }

  return { connected, ready, on, onReady, emit, request };
}
