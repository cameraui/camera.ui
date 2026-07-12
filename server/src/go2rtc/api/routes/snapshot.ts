import { assertResponseOk, fetchInstance } from '../instance.js';

import type { SourceData } from '../../types.js';
import type { RequestManager } from '../manager.js';

export class SnapshotRoute {
  constructor(private requestManager: RequestManager) {}

  public async jpeg(data: SourceData): Promise<ArrayBuffer> {
    const params = new URLSearchParams(data as any);

    return this.requestManager.deduplicatedRequest(`jpeg:${data.src}`, async () => {
      const response = await fetchInstance()(`/frame.jpeg?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/octet-stream',
        },
      });

      await assertResponseOk(response);

      const buffer = await response.arrayBuffer();
      if (buffer.byteLength === 0) {
        throw new Error(`Empty snapshot frame for ${data.src}`);
      }

      return buffer;
    });
  }

  public async mp4(data: SourceData): Promise<ArrayBuffer> {
    const params = new URLSearchParams(data as any);

    return this.requestManager.deduplicatedRequest(`mp4:${data.src}`, async () => {
      const response = await fetchInstance()(`/frame.mp4?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/octet-stream',
        },
      });

      await assertResponseOk(response);

      return response.arrayBuffer();
    });
  }
}
