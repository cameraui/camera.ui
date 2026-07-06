import { RemoteService } from '../../api/services/remote.service.js';
import { cloudFetch } from './instance.js';

import type { ServerOAuthCredentials } from '../../api/database/types.js';

export class NotAuthorizedError extends Error {}
export class InsufficientScopeError extends Error {
  constructor(required: string[], have: string[]) {
    super(`missing scopes: required [${required.join(', ')}], have [${have.join(', ')}]`);
  }
}

const CLIENT_ID = 'camera-ui-server';

export class CloudCredentialStore {
  private remote = new RemoteService();
  private refreshInFlight: Promise<string> | null = null;

  public async getAccessToken(requiredScopes: string[]): Promise<string> {
    const creds = await this.peek();
    if (!creds) {
      throw new NotAuthorizedError('Server not paired');
    }
    if (creds.needs_reauth) {
      throw new NotAuthorizedError('Cloud session revoked; re-authenticate the server under Settings → Remote');
    }
    if (!requiredScopes.every((s) => creds.scopes.includes(s))) {
      throw new InsufficientScopeError(requiredScopes, creds.scopes);
    }
    if (creds.expires_at > Date.now() + 60_000) {
      return creds.access_token;
    }
    this.refreshInFlight ??= this.refresh(creds.refresh_token).finally(() => {
      this.refreshInFlight = null;
    });
    return this.refreshInFlight;
  }

  public async forceRefresh(): Promise<string> {
    const creds = await this.peek();
    if (!creds) {
      throw new NotAuthorizedError('Server not paired');
    }
    if (creds.needs_reauth) {
      throw new NotAuthorizedError('Cloud session revoked; re-authenticate the server under Settings → Remote');
    }
    this.refreshInFlight ??= this.refresh(creds.refresh_token).finally(() => {
      this.refreshInFlight = null;
    });
    return this.refreshInFlight;
  }

  public async persist(creds: ServerOAuthCredentials): Promise<void> {
    await this.remote.patchCloud({ oauth: creds });
  }

  public async peek(): Promise<ServerOAuthCredentials | null> {
    return this.remote.getCloud().oauth ?? null;
  }

  public async invalidate(): Promise<void> {
    const creds = await this.peek();
    if (creds) {
      await this.persist({ ...creds, expires_at: 0 });
    }
  }

  private async markNeedsReauth(): Promise<void> {
    const creds = await this.peek();
    if (!creds || creds.needs_reauth) {
      return;
    }
    await this.persist({ ...creds, access_token: '', refresh_token: '', expires_at: 0, needs_reauth: true });
  }

  public async clear(): Promise<void> {
    await this.remote.patchCloud({ oauth: undefined });
  }

  private async refresh(refreshToken: string): Promise<string> {
    const fetchAuth = cloudFetch({ target: 'auth' });
    const res = await fetchAuth('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: CLIENT_ID,
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (body.error === 'invalid_grant') {
        await this.markNeedsReauth();
        throw new NotAuthorizedError('Cloud session revoked; re-authentication required');
      }
      throw new Error(`Token refresh failed (${res.status})`);
    }
    const body = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      scope: string;
      grant_id?: string;
    };
    const existing = await this.peek();
    const updated: ServerOAuthCredentials = {
      access_token: body.access_token,
      refresh_token: body.refresh_token,
      expires_at: Date.now() + body.expires_in * 1000,
      scopes: body.scope ? body.scope.split(' ') : (existing?.scopes ?? []),
      grant_id: body.grant_id ?? existing?.grant_id ?? '',
      server_id: existing?.server_id ?? '',
    };
    await this.persist(updated);
    return updated.access_token;
  }
}
