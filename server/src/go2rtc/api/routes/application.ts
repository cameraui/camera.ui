import { sleep } from '@camera.ui/common/utils';

import { assertResponseOk, fetchInstance } from '../instance.js';

import type { ApplicationResponse, ExitData } from '../../types.js';
import type { RequestManager } from '../manager.js';

export class ApplicationRoute {
  constructor(private requestManager: RequestManager) {}

  public async close(data: ExitData): Promise<void> {
    try {
      const params = new URLSearchParams(data as any);
      // no deduplication - we want to close every time
      await fetchInstance()(`/exit?${params}`, {
        method: 'POST',
      });
    } catch {
      // ignore
    }
  }

  public async info(): Promise<ApplicationResponse> {
    return this.requestManager.deduplicatedRequest('info', async () => {
      const response = await fetchInstance()('', {
        method: 'GET',
      });

      await assertResponseOk(response);

      return response.json() as Promise<ApplicationResponse>;
    });
  }

  public async restart(): Promise<void> {
    try {
      // no deduplication - we want to restart every time
      await fetchInstance()('/restart', { method: 'POST' });
      await sleep(250);
    } catch {
      // ignore
    }
  }
}
