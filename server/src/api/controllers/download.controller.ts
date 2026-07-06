import { container } from 'tsyringe';

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { DownloadManager } from '../../manager/downloadManager.js';
import type { ProxyServer } from '../../rpc/index.js';
import type { DownloadParamsRequest } from '../types/index.js';

export class DownloadController {
  private downloadManager: DownloadManager;

  constructor() {
    const proxyServer = container.resolve<ProxyServer>('proxy');
    this.downloadManager = proxyServer.downloadManager;
  }

  public async download(req: FastifyRequest<DownloadParamsRequest>, reply: FastifyReply): Promise<void> {
    return this.downloadManager.handleDownload(req, reply);
  }
}
