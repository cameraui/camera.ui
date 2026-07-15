import { RPCClass, RPCMethod } from '@camera.ui/rpc';
import { randomUUID } from 'node:crypto';
import { closeSync, createReadStream, existsSync, fstatSync, openSync, readSync, statSync, unlinkSync } from 'node:fs';
import { basename } from 'node:path';
import { Readable } from 'node:stream';
import { container } from 'tsyringe';

import { DownloadsService } from '../api/services/downloads.service.js';
import { NamespaceManager } from '../rpc/namespaces.js';

import type { Promisify } from '@camera.ui/rpc';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ServerResponse } from 'node:http';
import type { DownloadParamsRequest } from '../api/types/index.js';
import type { RemoteAccessManager } from '../remote/index.js';
import type { ProxyServer } from '../rpc/index.js';
import type {
  CreateDownloadOptions,
  CreateStreamDownloadOptions,
  DownloadCleanup,
  DownloadManagerInterface,
  DownloadToken,
  PluginFileServeInterface,
} from '../rpc/interfaces/download.js';
import type { LoggerService } from '../services/logger/index.js';

interface DownloadEntry {
  filePath: string;
  filename: string;
  mimeType: string;
  expiresAt: number;
  cleanup: DownloadCleanup;
  streaming?: boolean;
  markerPath?: string;
  remotePluginId?: string;
}

const REMOTE_CHUNK_SIZE = 256 * 1024;

const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes
const CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute
const STREAM_POLL_MS = 50;
const STREAM_FILE_WAIT_MS = 5000;

@RPCClass
export class DownloadManager implements DownloadManagerInterface {
  private proxyServer: ProxyServer;
  private logger: LoggerService;
  private downloadsService: DownloadsService;

  private namespaces = NamespaceManager.downloadManagerNamespaces();
  private closeProxy?: () => Promise<void>;

  private registry = new Map<string, DownloadEntry>();
  private cleanupTimer?: ReturnType<typeof setInterval>;

  constructor() {
    this.proxyServer = container.resolve<ProxyServer>('proxy');
    this.logger = container.resolve<LoggerService>('logger');
    this.downloadsService = new DownloadsService();
  }

  public async register(): Promise<void> {
    this.closeProxy = await this.proxyServer.proxy.registerHandler(this.namespaces.downloadManagerRpc, this);
    this.restoreFromPersistedRegistry();
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
  }

  public async destroy(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    await this.closeProxy?.();
  }

  @RPCMethod
  public async createDownload(options: CreateDownloadOptions): Promise<DownloadToken> {
    const token = randomUUID();
    const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    const expiresAt = Date.now() + ttlMs;
    const filename = options.filename ?? basename(options.filePath);
    const mimeType = options.mimeType ?? 'application/octet-stream';

    const entry: DownloadEntry = {
      filePath: options.filePath,
      filename,
      mimeType,
      expiresAt,
      cleanup: options.cleanup ?? 'never',
      remotePluginId: options.remotePluginId,
    };
    this.registry.set(token, entry);

    // Remote entries are session-bound to a live plugin connection — not
    // persisted (a restart would leave a dangling file-serve subject).
    if (!entry.remotePluginId) {
      this.persistEntry(token, entry);
    }

    this.logger.debug(`Download registered: ${token} -> ${filename} (expires in ${ttlMs}ms)`);

    return {
      token,
      url: `/api/download/${token}`,
      publicUrl: this.buildPublicUrl(token),
      expiresAt,
    };
  }

  @RPCMethod
  public async createStreamDownload(options: CreateStreamDownloadOptions): Promise<DownloadToken> {
    const token = randomUUID();
    const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    const expiresAt = Date.now() + ttlMs;
    const filename = options.filename ?? basename(options.filePath);
    const mimeType = options.mimeType ?? 'application/octet-stream';

    const entry: DownloadEntry = {
      filePath: options.filePath,
      filename,
      mimeType,
      expiresAt,
      cleanup: options.cleanup ?? 'never',
      streaming: true,
      markerPath: options.markerPath,
      remotePluginId: options.remotePluginId,
    };
    this.registry.set(token, entry);

    // Stream entries are always evicted on restart (see restoreFromPersistedRegistry);
    // remote ones additionally can't outlive the plugin connection.
    if (!entry.remotePluginId) {
      this.persistEntry(token, entry);
    }

    this.logger.debug(`Stream download registered: ${token} -> ${filename} (marker: ${options.markerPath})`);

    return {
      token,
      url: `/api/download/${token}`,
      publicUrl: this.buildPublicUrl(token),
      expiresAt,
    };
  }

  @RPCMethod
  public async deleteDownload(token: string): Promise<void> {
    const entry = this.registry.get(token);
    if (entry) {
      this.registry.delete(token);
      this.removePersistedEntry(token);
      if (entry.cleanup !== 'never') {
        this.tryDeleteFile(entry.filePath);
      }
    }
  }

  public async handleDownload(req: FastifyRequest<DownloadParamsRequest>, reply: FastifyReply): Promise<void> {
    const { token } = req.params;
    const entry = this.registry.get(token);

    if (!entry) {
      reply.code(404).send({ error: 'Download not found or expired' });
      return;
    }

    if (Date.now() > entry.expiresAt) {
      this.registry.delete(token);
      this.removePersistedEntry(token);
      this.tryDeleteFile(entry.filePath);
      reply.code(404).send({ error: 'Download expired' });
      return;
    }

    if (entry.streaming) {
      return this.handleStreamDownload(req, reply, token, entry);
    }

    if (entry.remotePluginId) {
      return this.handleRemoteDownload(reply, token, entry);
    }

    if (!existsSync(entry.filePath)) {
      this.registry.delete(token);
      this.removePersistedEntry(token);
      reply.code(404).send({ error: 'File not found' });
      return;
    }

    const stat = statSync(entry.filePath);

    reply.header('Content-Type', entry.mimeType);
    reply.header('Content-Disposition', `attachment; filename="${entry.filename}"`);
    reply.header('Content-Length', stat.size);

    const stream = createReadStream(entry.filePath);

    if (entry.cleanup === 'on-download') {
      stream.on('end', () => {
        this.registry.delete(token);
        this.removePersistedEntry(token);
        this.tryDeleteFile(entry.filePath);
      });
    }

    return reply.send(stream);
  }

  private fileServeProxy(pluginId: string): Promisify<PluginFileServeInterface> {
    return this.proxyServer.proxy.createProxy<PluginFileServeInterface>(NamespaceManager.pluginFileServeRpc(pluginId));
  }

  private awaitDrain(res: ServerResponse): Promise<void> {
    return new Promise<void>((resolve) => {
      const done = () => {
        res.off('drain', done);
        res.off('close', done);
        res.off('error', done);
        resolve();
      };
      res.once('drain', done);
      res.once('close', done);
      res.once('error', done);
    });
  }

  private async handleRemoteDownload(reply: FastifyReply, token: string, entry: DownloadEntry): Promise<void> {
    // Downloads a finished file that lives on a remote worker, pulling it in
    // ranged chunks over the plugin's file-serve RPC.

    const serve = this.fileServeProxy(entry.remotePluginId!);

    let stat: { exists: boolean; size: number };
    try {
      stat = await serve.statFile(entry.filePath);
    } catch (error: any) {
      this.logger.warn(`Remote download stat failed: ${entry.filePath} (${error.message})`);
      this.registry.delete(token);
      reply.code(404).send({ error: 'File not found on worker' });
      return;
    }

    if (!stat.exists) {
      this.registry.delete(token);
      reply.code(404).send({ error: 'File not found' });
      return;
    }

    reply.header('Content-Type', entry.mimeType);
    reply.header('Content-Disposition', `attachment; filename="${entry.filename}"`);
    reply.header('Content-Length', stat.size);

    const stream = Readable.from(this.pullRemoteChunks(serve, entry.filePath, stat.size));

    if (entry.cleanup === 'on-download') {
      stream.on('end', () => {
        this.registry.delete(token);
        this.deleteRemoteFile(entry).catch(() => {});
      });
    }

    return reply.send(stream);
  }

  private async *pullRemoteChunks(serve: Promisify<PluginFileServeInterface>, filePath: string, size: number): AsyncGenerator<Buffer> {
    let offset = 0;
    while (offset < size) {
      const length = Math.min(REMOTE_CHUNK_SIZE, size - offset);
      const chunk = await serve.readFileChunk(filePath, offset, length);
      if (chunk.length === 0) break;
      yield Buffer.from(chunk);
      offset += chunk.length;
    }
  }

  private buildPublicUrl(token: string): string {
    const externalUrl = container.resolve<RemoteAccessManager>('remoteAccessManager').getStatus().externalUrl;
    if (!externalUrl) return '';
    return `${externalUrl.replace(/\/+$/, '')}/api/download/${encodeURIComponent(token)}`;
  }

  private restoreFromPersistedRegistry(): void {
    const now = Date.now();
    let restored = 0;
    let evicted = 0;

    for (const entry of this.downloadsService.list()) {
      const token = entry._id;

      if (entry.streaming) {
        this.downloadsService.remove(token);
        this.tryDeleteFile(entry.filePath);
        if (entry.markerPath) this.tryDeleteFile(entry.markerPath);
        evicted++;
        continue;
      }

      if (now > entry.expiresAt) {
        this.downloadsService.remove(token);
        if (entry.cleanup !== 'never') this.tryDeleteFile(entry.filePath);
        evicted++;
        continue;
      }

      this.registry.set(token, {
        filePath: entry.filePath,
        filename: entry.filename,
        mimeType: entry.mimeType,
        expiresAt: entry.expiresAt,
        cleanup: entry.cleanup,
      });
      restored++;
    }

    if (restored > 0 || evicted > 0) {
      this.logger.debug(`Download registry restored: ${restored} valid, ${evicted} evicted`);
    }
  }

  private persistEntry(token: string, entry: DownloadEntry): void {
    this.downloadsService.put({
      _id: token,
      filePath: entry.filePath,
      filename: entry.filename,
      mimeType: entry.mimeType,
      expiresAt: entry.expiresAt,
      cleanup: entry.cleanup,
      streaming: entry.streaming,
      markerPath: entry.markerPath,
    });
  }

  private removePersistedEntry(token: string): void {
    this.downloadsService.remove(token);
  }

  private async deleteRemoteFile(entry: DownloadEntry): Promise<void> {
    if (!entry.remotePluginId) return;
    const serve = this.fileServeProxy(entry.remotePluginId);
    await serve.deleteFile(entry.filePath);
    if (entry.markerPath) await serve.deleteFile(entry.markerPath).catch(() => {});
  }

  private async handleRemoteStreamDownload(req: FastifyRequest<DownloadParamsRequest>, reply: FastifyReply, token: string, entry: DownloadEntry): Promise<void> {
    // Streams a growing export file from a remote worker: poll size via
    // statFile, pull new bytes via readFileChunk, stop when the marker is gone.

    const serve = this.fileServeProxy(entry.remotePluginId!);

    const deadline = Date.now() + STREAM_FILE_WAIT_MS;
    let initial = await serve.statFile(entry.filePath).catch(() => ({ exists: false, size: 0 }));
    while (!initial.exists && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, STREAM_POLL_MS));
      initial = await serve.statFile(entry.filePath).catch(() => ({ exists: false, size: 0 }));
    }

    if (!initial.exists) {
      this.registry.delete(token);
      reply.code(404).send({ error: 'Export file not created' });
      return;
    }

    const res = reply.raw;
    const reqRaw = req.raw;
    res.writeHead(200, {
      'Content-Type': entry.mimeType,
      'Content-Disposition': `attachment; filename="${entry.filename}"`,
      'Cache-Control': 'no-cache',
    });
    reply.hijack();

    let offset = 0;
    let destroyed = false;
    reqRaw.on('close', () => {
      destroyed = true;
    });

    try {
      while (!destroyed) {
        const stat = await serve.statFile(entry.filePath);
        const available = stat.size - offset;

        if (available > 0) {
          for (let remaining = available; remaining > 0 && !destroyed;) {
            const length = Math.min(remaining, REMOTE_CHUNK_SIZE);
            const chunk = Buffer.from(await serve.readFileChunk(entry.filePath, offset, length));
            if (chunk.length === 0) break;
            offset += chunk.length;
            remaining -= chunk.length;
            if (!res.write(chunk) && !destroyed) {
              await this.awaitDrain(res);
            }
          }
        } else {
          // Marker gone → writer finished; flush any tail and stop.
          const marker = entry.markerPath ? await serve.statFile(entry.markerPath) : { exists: false, size: 0 };
          if (!marker.exists) {
            const finalStat = await serve.statFile(entry.filePath);
            while (offset < finalStat.size && !destroyed) {
              const length = Math.min(finalStat.size - offset, REMOTE_CHUNK_SIZE);
              const chunk = Buffer.from(await serve.readFileChunk(entry.filePath, offset, length));
              if (chunk.length === 0) break;
              res.write(chunk);
              offset += chunk.length;
            }
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, STREAM_POLL_MS));
        }
      }
    } catch (err) {
      this.logger.warn(`Remote stream download error: ${entry.filePath}`, err);
    } finally {
      res.end();
      this.registry.delete(token);
      if (entry.cleanup !== 'never') await this.deleteRemoteFile(entry).catch(() => {});
    }
  }

  private async handleStreamDownload(req: FastifyRequest<DownloadParamsRequest>, reply: FastifyReply, token: string, entry: DownloadEntry): Promise<void> {
    if (entry.remotePluginId) {
      return this.handleRemoteStreamDownload(req, reply, token, entry);
    }

    const fileReady = await this.waitForFile(entry.filePath, STREAM_FILE_WAIT_MS);
    if (!fileReady) {
      this.registry.delete(token);
      this.removePersistedEntry(token);
      reply.code(404).send({ error: 'Export file not created' });
      return;
    }

    const res = reply.raw;
    const reqRaw = req.raw;

    res.writeHead(200, {
      'Content-Type': entry.mimeType,
      'Content-Disposition': `attachment; filename="${entry.filename}"`,
      'Cache-Control': 'no-cache',
    });

    // Manage the response manually — Fastify must not touch it after this.
    reply.hijack();

    let fd: number | undefined;
    let offset = 0;
    let destroyed = false;
    const buf = Buffer.allocUnsafe(64 * 1024);

    const cleanup = () => {
      destroyed = true;
      if (fd !== undefined) {
        try {
          closeSync(fd);
        } catch {
          // ignore
        }
        fd = undefined;
      }
      this.registry.delete(token);
      this.removePersistedEntry(token);
      if (entry.cleanup !== 'never') {
        this.tryDeleteFile(entry.filePath);
      }
    };

    reqRaw.on('close', () => {
      destroyed = true;
    });

    try {
      fd = openSync(entry.filePath, 'r');

      while (true) {
        if (destroyed) break;

        const stat = fstatSync(fd);
        const available = stat.size - offset;

        if (available > 0) {
          let remaining = available;
          while (remaining > 0 && !destroyed) {
            const toRead = Math.min(remaining, buf.length);
            const bytesRead = readSync(fd, buf, 0, toRead, offset);
            if (bytesRead === 0) break;
            const chunk = Buffer.from(buf.subarray(0, bytesRead));
            const canWrite = res.write(chunk);
            offset += bytesRead;
            remaining -= bytesRead;

            if (!canWrite && !destroyed) {
              await this.awaitDrain(res);
            }
          }
        } else {
          // Marker gone → writer has finished; flush any tail bytes and stop.
          if (entry.markerPath && !existsSync(entry.markerPath)) {
            const finalStat = fstatSync(fd);
            while (offset < finalStat.size && !destroyed) {
              const toRead = Math.min(finalStat.size - offset, buf.length);
              const bytesRead = readSync(fd, buf, 0, toRead, offset);
              if (bytesRead === 0) break;
              res.write(Buffer.from(buf.subarray(0, bytesRead)));
              offset += bytesRead;
            }
            break;
          }

          await new Promise<void>((resolve) => setTimeout(resolve, STREAM_POLL_MS));
        }
      }
    } catch (err) {
      this.logger.warn(`Stream download error: ${entry.filePath}`, err);
    } finally {
      res.end();
      cleanup();
    }
  }

  private waitForFile(filePath: string, timeoutMs: number): Promise<boolean> {
    if (existsSync(filePath)) return Promise.resolve(true);

    return new Promise((resolve) => {
      const start = Date.now();
      const check = () => {
        if (existsSync(filePath)) {
          resolve(true);
        } else if (Date.now() - start > timeoutMs) {
          resolve(false);
        } else {
          setTimeout(check, 100);
        }
      };
      setTimeout(check, 100);
    });
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [token, entry] of this.registry) {
      if (now > entry.expiresAt) {
        this.registry.delete(token);
        this.removePersistedEntry(token);
        if (entry.cleanup !== 'never') {
          this.tryDeleteFile(entry.filePath);
        }
        this.logger.debug(`Download expired and cleaned up: ${token}`);
      }
    }
  }

  private tryDeleteFile(filePath: string): void {
    try {
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
    } catch (err) {
      this.logger.warn(`Failed to delete download file: ${filePath}`, err);
    }
  }
}
