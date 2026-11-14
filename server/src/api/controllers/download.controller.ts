import { inject } from '../../container.js';

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { DownloadManager } from '../../manager/downloadManager.js';
import type { DownloadParamsRequest } from '../types/index.js';

export class DownloadController {
  private downloadManager: DownloadManager;

  constructor() {
    const proxyServer = inject('proxy');
    this.downloadManager = proxyServer.downloadManager;
  }

  public async download(req: FastifyRequest<DownloadParamsRequest>, reply: FastifyReply): Promise<void> {
    return this.downloadManager.handleDownload(req, reply);
  }

  public async check(req: FastifyRequest<DownloadParamsRequest>, reply: FastifyReply): Promise<void> {
    return this.downloadManager.handleDownloadCheck(req, reply);
  }

  public cancel(req: FastifyRequest<DownloadParamsRequest>, reply: FastifyReply): void {
    this.downloadManager.handleDownloadCancel(req, reply);
  }
}
