import { dump } from 'js-yaml';

import { assertResponseOk, fetchInstance } from '../instance.js';

import type { RequestManager } from '../manager.js';

export class ConfigRoute {
  constructor(private requestManager: RequestManager) {}

  public async getConfig(): Promise<any> {
    return this.requestManager.deduplicatedRequest('getConfig', async () => {
      const response = await fetchInstance()('/config', {
        method: 'GET',
      });

      await assertResponseOk(response);

      return response.text();
    });
  }

  public async rewriteConfig(data: Record<string, any>): Promise<void> {
    if (data.streams && Object.keys(data.streams).length === 0) {
      delete data.streams;
    }

    const config = dump(data, { lineWidth: -1, noRefs: true });

    // global queue keeps all config writes sequential, no dedup
    const response = await this.requestManager.globalQueuedRequest(() =>
      fetchInstance()('/config', {
        method: 'POST',
        body: config,
      }),
    );

    await assertResponseOk(response);
  }

  public async mergeConfig(data: Record<string, any>): Promise<void> {
    if (data.streams && Object.keys(data.streams).length === 0) {
      delete data.streams;
    }

    const config = dump(data, { lineWidth: -1, noRefs: true });

    // global queue keeps all config writes sequential, no dedup
    const response = await this.requestManager.globalQueuedRequest(() =>
      fetchInstance()('/config', {
        method: 'PATCH',
        body: config,
      }),
    );

    await assertResponseOk(response);
  }
}
