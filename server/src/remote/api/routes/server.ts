import { assertResponseOk, cloudFetch } from '../instance.js';

import type { CloudCredentialStore } from '../credentialStore.js';

export interface UpdateServerInput {
  name?: string;
  disabled?: boolean;
  fcm_token?: string;
}

export interface ShareRegisterInput {
  token_hash: string;
  expires_at: string;
}

export class ServerRoute {
  private updateChain: Promise<unknown> = Promise.resolve();

  constructor(private credentialStore: CloudCredentialStore) {}

  public update(payload: UpdateServerInput): Promise<void> {
    const run = this.updateChain.then(() => this.doUpdate(payload));
    this.updateChain = run.catch(() => {});
    return run;
  }

  private async doUpdate(payload: UpdateServerInput): Promise<void> {
    const fetchCloud = cloudFetch({
      target: 'cloud',
      credentialStore: this.credentialStore,
      requiredScopes: ['server:update'],
    });
    const res = await fetchCloud('/api/v1/update', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    await assertResponseOk(res);
  }

  public async registerShare(payload: ShareRegisterInput): Promise<void> {
    const fetchCloud = cloudFetch({
      target: 'cloud',
      credentialStore: this.credentialStore,
      requiredScopes: ['server:share'],
    });
    const res = await fetchCloud('/api/v1/shares/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    await assertResponseOk(res);
  }

  public async deleteShare(tokenHash: string): Promise<void> {
    const fetchCloud = cloudFetch({
      target: 'cloud',
      credentialStore: this.credentialStore,
      requiredScopes: ['server:share'],
    });
    const res = await fetchCloud(`/api/v1/shares/${tokenHash}`, { method: 'DELETE' });
    await assertResponseOk(res);
  }

  public async unregister(): Promise<void> {
    const fetchCloud = cloudFetch({
      target: 'cloud',
      credentialStore: this.credentialStore,
      requiredScopes: ['server:unregister'],
    });
    const res = await fetchCloud('/api/v1/unregister', { method: 'DELETE' });
    await assertResponseOk(res);
  }
}
