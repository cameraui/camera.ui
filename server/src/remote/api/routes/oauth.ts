import { hostname } from 'node:os';

import { assertResponseOk, cloudFetch } from '../instance.js';

import type { CloudCredentialStore } from '../credentialStore.js';

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

export type PollState = 'pending' | 'slow_down' | 'expired' | 'denied' | 'approved' | 'error';

export interface PollResult {
  state: PollState;
  grant_id?: string;
  server_id?: string;
  error?: string;
}

const CLIENT_ID = 'camera-ui-server';
const SCOPES = 'server:register server:update server:share server:unregister tunnel:connect';

export class OAuthRoute {
  constructor(private credentialStore: CloudCredentialStore) {}

  public async startDeviceFlow(requestedServerId?: string): Promise<DeviceCodeResponse> {
    const fetchAuth = cloudFetch({ target: 'auth' });
    const body = new URLSearchParams({
      client_id: CLIENT_ID,
      scope: SCOPES,
      device_name: hostname(),
    });
    if (requestedServerId) {
      body.set('requested_server_id', requestedServerId);
    }
    const res = await fetchAuth('/oauth/device/code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    await assertResponseOk(res);
    return (await res.json()) as DeviceCodeResponse;
  }

  public async pollDeviceFlow(deviceCode: string): Promise<PollResult> {
    const fetchAuth = cloudFetch({ target: 'auth' });
    const res = await fetchAuth('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: deviceCode,
        client_id: CLIENT_ID,
      }),
    });
    const body = (await res.json()) as {
      error?: string;
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      grant_id?: string;
      server_id?: string;
    };

    if (body.error === 'authorization_pending') {
      return { state: 'pending' };
    }
    if (body.error === 'slow_down') {
      return { state: 'slow_down' };
    }
    if (body.error === 'expired_token') {
      return { state: 'expired' };
    }
    if (body.error === 'access_denied') {
      return { state: 'denied' };
    }
    if (res.ok && body.access_token && body.refresh_token) {
      await this.credentialStore.persist({
        access_token: body.access_token,
        refresh_token: body.refresh_token,
        expires_at: Date.now() + (body.expires_in ?? 0) * 1000,
        scopes: body.scope ? body.scope.split(' ') : [],
        grant_id: body.grant_id ?? '',
        server_id: body.server_id ?? '',
      });
      return { state: 'approved', grant_id: body.grant_id, server_id: body.server_id };
    }
    return { state: 'error', error: body.error };
  }

  public async revoke(): Promise<void> {
    const creds = await this.credentialStore.peek();
    if (!creds) {
      return;
    }
    const fetchAuth = cloudFetch({ target: 'auth' });
    await fetchAuth('/oauth/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: creds.refresh_token, client_id: CLIENT_ID }),
    });
    await this.credentialStore.clear();
  }
}
