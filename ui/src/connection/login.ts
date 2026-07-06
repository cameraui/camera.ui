import { raceFirst } from '@camera.ui/transport';

import { getBootResult } from './bootApp.js';
import { instanceOverride } from './instance.js';
import { isTwoFactorPending } from './types.js';

import type { Endpoint, RaceCandidate, Tokens } from '@camera.ui/transport';
import type { AuthApi, CloudSessionHolder, Connection, LoginCredentials, LoginOutcome, LoginResult, Tokens as TokensType } from './types.js';

interface ResolvedEndpoint {
  readonly endpoint: Endpoint;
  readonly extraTokens?: Pick<TokensType, 'proxySession' | 'proxySessionExpiresAt' | 'proxyRefresh'>;
}

export async function loginDirect(connection: Connection, api: AuthApi, endpointUrl: string, credentials: LoginCredentials): Promise<LoginOutcome> {
  const outcome = await api.loginDirect(endpointUrl, credentials);
  if (isTwoFactorPending(outcome)) return outcome;

  const endpoint: Endpoint = { url: endpointUrl, mode: 'direct-lan', priority: 0 };
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
  if (boot.mode === 'cloud') {
    if (!boot.cloudSession) throw new Error('login(): cloud mode but cloudSession missing');
    return loginCloud(boot.connection, boot.api, boot.cloudSession, credentials);
  }
  // If the user is currently active on a remote instance (cold-boot after
  // CTRL+R with `activeId` set, or any time instanceOverride is live), the
  // login form is authenticating against THAT instance — not the home origin
  // that hosts the SPA bundle. Falling back to window.location.origin would
  // mint home tokens and silently switch the user back to home.
  const endpointUrl = instanceOverride.value ?? window.location.origin;
  return loginDirect(boot.connection, boot.api, endpointUrl, credentials);
}

export async function verify2FA(tempToken: string, code: string): Promise<LoginResult> {
  const boot = getBootResult();
  let endpoint: Endpoint;
  let extraTokens: ResolvedEndpoint['extraTokens'];

  if (boot.mode === 'cloud') {
    if (!boot.cloudSession) throw new Error('verify2FA(): cloud mode but cloudSession missing');
    const resolved = await resolveCloudEndpoint(boot.api, boot.cloudSession, boot.connection);
    endpoint = resolved.endpoint;
    extraTokens = resolved.extraTokens;
  } else {
    const endpointUrl = instanceOverride.value ?? window.location.origin;
    endpoint = { url: endpointUrl, mode: 'direct-lan', priority: 0 };
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

  // Read BEFORE reset() — dispatch is synchronous, afterwards the phase is
  // always 'idle' and the instanceId would be lost.
  const phase = connection.phase.value;
  const instanceId = (phase.kind === 'idle' ? null : phase.instanceId) ?? 'default';

  connection.reset();
  connection.boot(instanceId);
}

async function resolveCloudEndpoint(api: AuthApi, cloudSession: CloudSessionHolder, connection: Connection): Promise<ResolvedEndpoint> {
  const session = cloudSession.state.value;
  if (!session) throw new Error('resolveCloudEndpoint(): cloud session not initialised');

  const addresses = await api.tunnelCheck(session.proxyUrl, session.proxyToken);
  const internals = addresses.internalAddresses;
  const externals = addresses.externalAddresses;
  if (internals.length === 0 && externals.length === 0) {
    throw new Error('tunnel/check returned no reachable addresses');
  }

  const reached = connection.lastReachableEndpoint.value;
  let resolvedUrl: string | null = reached && (internals.includes(reached) || externals.includes(reached)) ? reached : null;

  if (!resolvedUrl && internals.length + externals.length > 1) {
    const candidates: RaceCandidate<true>[] = [
      ...internals.map((url): RaceCandidate<true> => ({ endpoint: { url, mode: 'direct-lan' }, run: probeReachability(api, url) })),
      ...externals.map((url): RaceCandidate<true> => ({ endpoint: { url, mode: 'direct-wan' }, run: probeReachability(api, url) })),
    ];
    try {
      const winner = await raceFirst(candidates);
      resolvedUrl = winner.endpoint.url;
    } catch {
      // All candidates unreachable — fall through to last-resort below.
    }
  }

  resolvedUrl ??= internals[0] ?? externals[0]!;

  const mode: 'direct-lan' | 'direct-wan' = internals.includes(resolvedUrl) ? 'direct-lan' : 'direct-wan';
  return {
    endpoint: { url: resolvedUrl, mode, priority: 0 },
    extraTokens: {
      proxySession: session.proxyToken,
      proxySessionExpiresAt: session.proxyTokenExpiresAt,
      proxyRefresh: session.proxyRefreshToken,
    },
  };
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
