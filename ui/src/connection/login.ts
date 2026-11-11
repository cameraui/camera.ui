import { raceFirst } from '@camera.ui/transport';

import { homeOrigin } from '@/common/base.js';
import { getBootResult } from './bootApp.js';
import { directServerPool, getDirectServer } from './directServer.js';
import { instanceOverride } from './instance.js';
import { isTwoFactorPending } from './types.js';

import type { Endpoint, RaceCandidate, Tokens } from '@camera.ui/transport';
import type { AuthApi, CloudSessionHolder, Connection, LoginCredentials, LoginOutcome, LoginResult, Tokens as TokensType } from './types.js';

interface ResolvedEndpoint {
  readonly endpoint: Endpoint;
  readonly extraTokens?: Pick<TokensType, 'proxySession' | 'proxySessionExpiresAt' | 'proxyRefresh'>;
}

export async function loginDirect(connection: Connection, api: AuthApi, endpoint: Endpoint, credentials: LoginCredentials): Promise<LoginOutcome> {
  const outcome = await api.loginDirect(endpoint.url, credentials);
  if (isTwoFactorPending(outcome)) return outcome;

  await connection.seedAndRetry({ endpoint, tokens: outcome.tokens });
  return outcome;
}

export async function loginCloud(connection: Connection, api: AuthApi, cloudSession: CloudSessionHolder, credentials: LoginCredentials): Promise<LoginOutcome> {
  const resolved = await resolveCloudEndpoint(api, cloudSession, connection);
  const outcome = await api.loginDirect(resolved.endpoint.url, credentials);
  if (isTwoFactorPending(outcome)) return outcome;

  await connection.seedAndRetry({
    endpoint: resolved.endpoint,
    tokens: foldProxyTokens(outcome.tokens, resolved.extraTokens),
  });
  return outcome;
}

export async function login(credentials: LoginCredentials): Promise<LoginOutcome> {
  const boot = getBootResult();
  if (usesCloudLogin(boot.mode)) {
    if (!boot.cloudSession) throw new Error('login(): cloud mode but cloudSession missing');
    return loginCloud(boot.connection, boot.api, boot.cloudSession, credentials);
  }
  return loginDirect(boot.connection, boot.api, await resolveDirectEndpoint(boot.api, boot.connection), credentials);
}

export async function verify2FA(tempToken: string, code: string): Promise<LoginResult> {
  const boot = getBootResult();
  let endpoint: Endpoint;
  let extraTokens: ResolvedEndpoint['extraTokens'];

  if (usesCloudLogin(boot.mode)) {
    if (!boot.cloudSession) throw new Error('verify2FA(): cloud mode but cloudSession missing');
    const resolved = await resolveCloudEndpoint(boot.api, boot.cloudSession, boot.connection);
    endpoint = resolved.endpoint;
    extraTokens = resolved.extraTokens;
  } else {
    endpoint = await resolveDirectEndpoint(boot.api, boot.connection);
  }

  const result = await boot.api.verify2FA(endpoint.url, tempToken, code);
  await boot.connection.seedAndRetry({
    endpoint,
    tokens: foldProxyTokens(result.tokens, extraTokens),
  });
  return result;
}

export async function logoutCurrent(): Promise<void> {
  const boot = getBootResult();
  await logout(boot.connection, boot.api);
}

export async function logout(connection: Connection, api: AuthApi): Promise<void> {
  const live = connection.target.value;
  if (live?.tokens.access) {
    try {
      await api.logoutDirect(live.endpoint.url, live.tokens.access);
    } catch {
      // ignore
    }
  }

  // read before reset(), the phase is idle right after
  const phase = connection.phase.value;
  const instanceId = (phase.kind === 'idle' ? null : phase.instanceId) ?? 'default';

  connection.reset();
  connection.boot(instanceId);
}

function usesCloudLogin(mode: string): boolean {
  // the cloud session only knows the home server
  return mode === 'cloud' && !instanceOverride.value;
}

async function resolveDirectEndpoint(api: AuthApi, connection: Connection): Promise<Endpoint> {
  // log in against the active instance, the home origin would silently switch the user back home
  if (instanceOverride.value) return { url: instanceOverride.value, mode: 'direct-lan', priority: 0 };
  const server = getDirectServer();
  if (!server) return { url: homeOrigin(), mode: 'direct-lan', priority: 0 };
  return pickReachable(api, connection, directServerPool(server));
}

async function resolveCloudEndpoint(api: AuthApi, cloudSession: CloudSessionHolder, connection: Connection): Promise<ResolvedEndpoint> {
  const session = cloudSession.state.value;
  if (!session) throw new Error('resolveCloudEndpoint(): cloud session not initialised');

  const addresses = await api.tunnelCheck(session.proxyUrl, session.proxyToken);
  const pool: Endpoint[] = [
    ...addresses.internalAddresses.map((url): Endpoint => ({ url, mode: 'direct-lan' })),
    ...addresses.externalAddresses.map((url): Endpoint => ({ url, mode: 'direct-wan' })),
  ];
  if (pool.length === 0) {
    throw new Error('tunnel/check returned no reachable addresses');
  }

  return {
    endpoint: await pickReachable(api, connection, pool),
    extraTokens: {
      proxySession: session.proxyToken,
      proxySessionExpiresAt: session.proxyTokenExpiresAt,
      proxyRefresh: session.proxyRefreshToken,
    },
  };
}

async function pickReachable(api: AuthApi, connection: Connection, pool: readonly Endpoint[]): Promise<Endpoint> {
  const reached = pool.find((endpoint) => endpoint.url === connection.lastReachableEndpoint.value);
  let picked = reached ?? (pool.length === 1 ? pool[0] : undefined);

  if (!picked) {
    const candidates = pool.map((endpoint): RaceCandidate<true> => ({ endpoint, run: probeReachability(api, endpoint.url) }));
    try {
      picked = (await raceFirst(candidates)).endpoint;
    } catch {
      // all candidates unreachable
    }
  }

  const { url, mode } = picked ?? pool[0]!;
  return { url, mode, priority: 0 };
}

function probeReachability(api: AuthApi, url: string): (signal: AbortSignal) => Promise<true> {
  return async (signal) => {
    try {
      await api.authCheck(url, '', signal);
      return true;
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (typeof status === 'number') return true;
      throw err;
    }
  };
}

function foldProxyTokens(base: Tokens, extra: ResolvedEndpoint['extraTokens']): Tokens {
  if (!extra) return base;
  return { ...base, ...extra };
}
