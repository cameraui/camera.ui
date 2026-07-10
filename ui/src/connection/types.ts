import type { Logger } from '@camera.ui/logger';
import type { ConnectionPhase, ConnectionTarget, Endpoint, Kernel, ProbeContext, RefreshReason, StorageAdapter, Tokens } from '@camera.ui/transport';
import type { HttpTransport } from '@camera.ui/transport/transports/http';
import type { NatsTransport } from '@camera.ui/transport/transports/nats';
import type { SocketioTransport } from '@camera.ui/transport/transports/socketio';
import type { WsTransport } from '@camera.ui/transport/transports/ws';
import type { ComputedRef, Ref, ShallowRef } from 'vue';

export type ConnectionMode = 'direct' | 'cloud';

export type DiscoverFn = (signal: AbortSignal) => Promise<readonly Endpoint[]>;
export type ProbeFn = (ctx: ProbeContext) => Promise<Tokens>;
export type RefreshFn = (target: ConnectionTarget, reason: RefreshReason) => Promise<Tokens>;

export interface ConnectionAdapters {
  readonly storage: StorageAdapter;
  readonly visibilitySource: EventTarget;
  readonly networkSource: EventTarget;
  readonly networkChangeSource?: EventTarget;
}

export interface RefreshCoordination {
  readonly acquireLock: <T>(fn: () => Promise<T>) => Promise<T>;
  readonly getLatestTokens: () => Tokens | null;
}

export interface ConnectionCallbacks {
  readonly discover: DiscoverFn;
  readonly probe: ProbeFn;
  readonly refresh: RefreshFn;
  readonly onWake?: () => void;
  readonly bindRefresh?: (co: RefreshCoordination) => void;
  readonly onConnectionReset?: () => void;
}

export interface ConnectionOptions {
  readonly adapters: ConnectionAdapters;
  readonly callbacks: ConnectionCallbacks;
  readonly apiPrefix?: string;
  readonly logger?: Logger;
  readonly storageNamespace?: string;
}

export interface Connection {
  readonly kernel: Kernel;
  readonly phase: ShallowRef<ConnectionPhase>;
  readonly target: Ref<ConnectionTarget | null>;

  readonly http: HttpTransport;
  readonly socketio: SocketioTransport;
  readonly nats: NatsTransport;
  readonly ws: WsTransport;

  readonly lastReachableEndpoint: Ref<string | null>;
  readonly troubleElapsedMs: ComputedRef<number>;
  readonly hasBeenOnline: Ref<boolean>;

  boot(instanceId: string): void;
  retry(): void;
  reset(): void;
  detach(): Promise<void>;
  seedAndRetry(target: ConnectionTarget, instanceId?: string): Promise<void>;
  onWake(listener: () => void): () => void;
  whenOnline(opts?: { timeoutMs?: number; signal?: AbortSignal }): Promise<boolean>;
}

export interface CloudSession {
  readonly proxyUrl: string;
  readonly proxyToken: string;
  readonly proxyRefreshToken?: string;
  readonly proxyTokenExpiresAt?: number;
  readonly proxyRefreshTokenExpiresAt?: number;
  readonly serverId?: string;
  readonly cloudApiBase?: string;
}

export interface CloudSessionHolder {
  readonly state: ShallowRef<CloudSession | null>;
  set(next: CloudSession): void;
  patch(partial: Partial<CloudSession>): void;
  clear(): void;
}

export interface LoginResult {
  readonly tokens: Tokens;
  readonly user?: LoginUserData;
  readonly raw: unknown;
}

export interface LoginUserData {
  readonly _id?: string;
  readonly username?: string;
  readonly email?: string;
  readonly role?: string;
  readonly firstLogin?: boolean;
  readonly avatar?: string;
  readonly language?: string;
  readonly [key: string]: unknown;
}

export interface TwoFactorPending {
  readonly twoFactorPending: true;
  readonly tempToken: string;
  readonly raw: unknown;
}

export type LoginOutcome = LoginResult | TwoFactorPending;

export function isTwoFactorPending(outcome: LoginOutcome): outcome is TwoFactorPending {
  return 'twoFactorPending' in outcome && outcome.twoFactorPending === true;
}

export interface TunnelAddresses {
  readonly internalAddresses: readonly string[];
  readonly externalAddresses: readonly string[];
}

export interface ProxyMintResult {
  readonly proxyUrl: string;
  readonly proxyToken: string;
  readonly proxyRefreshToken?: string;
  readonly proxyTokenExpiresAt?: number;
  readonly proxyRefreshTokenExpiresAt?: number;
}

export interface LoginCredentials {
  readonly username: string;
  readonly password: string;
  readonly kind?: 'web' | 'native';
  readonly persistent?: boolean;
  readonly device?: { readonly id: string; readonly name: string };
}

export interface AuthApi {
  loginDirect(endpoint: string, credentials: LoginCredentials, signal?: AbortSignal): Promise<LoginOutcome>;
  verify2FA(endpoint: string, tempToken: string, code: string, signal?: AbortSignal): Promise<LoginResult>;
  refreshDirect(endpoint: string, refreshToken: string, signal?: AbortSignal): Promise<LoginResult>;
  authCheck(endpoint: string, accessToken: string, signal?: AbortSignal): Promise<void>;
  logoutDirect(endpoint: string, accessToken: string): Promise<void>;
  tunnelCheck(proxyUrl: string, proxyToken: string, signal?: AbortSignal): Promise<TunnelAddresses>;
  refreshProxy(cloudApiBase: string, proxyRefreshToken: string, signal?: AbortSignal): Promise<ProxyMintResult>;
  remintProxyFromL1(cloudApiBase: string, serverId: string, l1AccessToken: string, signal?: AbortSignal): Promise<ProxyMintResult>;
}

export type { ConnectionTarget, Endpoint, StorageAdapter, Tokens };
