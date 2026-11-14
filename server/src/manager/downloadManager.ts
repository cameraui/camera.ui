import { RPCMethod } from '@camera.ui/rpc';
import { randomUUID } from 'node:crypto';
import { closeSync, createReadStream, existsSync, fstatSync, openSync, readSync, statSync } from 'node:fs';
import { readFile, realpath, stat, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';

import { DownloadsService } from '../api/services/downloads.service.js';
import { inject, tryInject } from '../container.js';
import { NVR_PLUGIN_NAMES } from '../plugins/nvr.js';
import { decodeEnvelope } from '../plugins/store/envelope.js';
import { STORE_FILE_NAME } from '../plugins/store/pluginStoreFile.js';
import { NamespaceManager, SUBJECT_TOKEN } from '../rpc/namespaces.js';
import { attachmentHeader } from '../utils/attachment.js';

import type { Promisify } from '@camera.ui/rpc';
import type { DownloadCleanup, DownloadToken } from '@camera.ui/sdk';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ServerResponse } from 'node:http';
import type { DownloadParamsRequest } from '../api/types/index.js';
import type { ProxyServer } from '../rpc/index.js';
import type {
  CreateDownloadOptions,
  CreatePipeDownloadOptions,
  CreateStreamDownloadOptions,
  DownloadManagerInterface,
  PipeState,
  PluginFileServeInterface,
  PluginPipeInterface,
} from '../rpc/interfaces/download.js';
import type { ConfigService } from '../services/config/index.js';
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
  owned?: boolean;
  release?: () => Promise<void>;
}

interface PipeEntry {
  pluginId: string;
  pipeId: string;
  filename: string;
  mimeType: string;
  expiresAt: number;
}

export interface ServerDownloadOptions {
  filePath: string;
  filename: string;
  mimeType: string;
  release?: () => Promise<void>;
}

const REMOTE_CHUNK_SIZE = 256 * 1024;

const DEFAULT_TTL_MS = 10 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 1000;
const STREAM_POLL_MS = 50;
const STREAM_FILE_WAIT_MS = 5000;
const STREAM_MARKER_WAIT_POLL_MS = 250;
// how often a running download asks its plugin for its state, the plugin gives up one it does not hear about for a minute
const PIPE_PROBE_MS = 15 * 1000;
// a client that takes no bytes for this long is gone, a save dialog or a short pause stays below it
const PIPE_STALL_MS = 5 * 60 * 1000;

const CONFIG_STORE_DIR = 'volume';
const EXPORTS_DIR = '.exports';
const ZONE_KINDS = ['closed', 'exports', 'plugin', 'plugins'] as const;

type ZoneKind = (typeof ZONE_KINDS)[number];

interface Zone {
  root: string;
  kind: ZoneKind;
}

async function tryRealpath(path: string): Promise<string | undefined> {
  return realpath(path).catch(() => undefined);
}

async function realZones(kind: ZoneKind, paths: string[]): Promise<Zone[]> {
  const roots = await Promise.all(paths.map(tryRealpath));
  return roots.filter((root): root is string => !!root).map((root) => ({ root, kind }));
}

async function realTarget(path: string, followLink: boolean): Promise<string | undefined> {
  const real = followLink ? await tryRealpath(path) : undefined;
  if (real) return real;
  const parent = await tryRealpath(dirname(path));
  return parent ? join(parent, basename(path)) : undefined;
}

function segmentsBelow(root: string, path: string): string[] | undefined {
  const rel = relative(root, path);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return undefined;
  return rel ? rel.split(sep) : [];
}

function zoneAllows(kind: ZoneKind, segments: string[]): boolean {
  switch (kind) {
    case 'closed':
      return false;
    case 'exports':
      return segments.length > 0;
    case 'plugin':
      return segments.length > 0 && segments[0] !== CONFIG_STORE_DIR;
    case 'plugins': {
      // <plugin>/... or @scope/<plugin>/...
      const depth = segments[0]?.startsWith('@') ? 2 : 1;
      return segments.length > depth && segments[depth] !== CONFIG_STORE_DIR;
    }
  }
}

function isSubjectToken(value: unknown): value is string {
  return typeof value === 'string' && SUBJECT_TOKEN.test(value);
}

async function readPluginSetting(storagePath: string, key: string): Promise<string | undefined> {
  try {
    const value = decodeEnvelope(await readFile(join(storagePath, CONFIG_STORE_DIR, STORE_FILE_NAME))).plugin?.[key];
    return typeof value === 'string' ? value : undefined;
  } catch {
    return undefined;
  }
}

export class DownloadManager implements DownloadManagerInterface {
  private proxyServer: ProxyServer;
  private logger: LoggerService;
  private configService: ConfigService;
  private downloadsService: DownloadsService;

  private namespaces = NamespaceManager.downloadManagerNamespaces();
  private closeProxy?: () => Promise<void>;

  private registry = new Map<string, DownloadEntry>();
  private pipes = new Map<string, PipeEntry>();
  private pipeProbeMs = PIPE_PROBE_MS;
  private pipeStallMs = PIPE_STALL_MS;
  private exportFolders = new Set<string>();
  private cleanupTimer?: ReturnType<typeof setInterval>;

  constructor() {
    this.proxyServer = inject('proxy');
    this.logger = inject('logger');
    this.configService = inject('configService');
    this.downloadsService = new DownloadsService();
  }

  public async register(): Promise<void> {
    this.closeProxy = await this.proxyServer.proxy.registerHandler(this.namespaces.downloadManagerRpc, this);
    await this.restoreFromPersistedRegistry();
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
    if (!options.remotePluginId) {
      await this.assertLocalPath(options.filePath);
    }

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

    // remote entries die with the plugin connection, after a restart the file-serve subject would dangle
    if (!entry.remotePluginId) {
      this.persistEntry(token, entry);
    }

    this.logger.debug(`Download registered: ${token} -> ${filename} (expires in ${ttlMs}ms)`);

    return this.downloadToken(token, expiresAt);
  }

  @RPCMethod
  public async createStreamDownload(options: CreateStreamDownloadOptions): Promise<DownloadToken> {
    if (!options.remotePluginId) {
      await this.assertLocalPath(options.filePath);
      if (options.markerPath) await this.assertLocalPath(options.markerPath);
    }

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

    // stream entries are evicted on restart anyway, remote ones cannot outlive the plugin connection
    if (!entry.remotePluginId) {
      this.persistEntry(token, entry);
    }

    this.logger.debug(`Stream download registered: ${token} -> ${filename} (marker: ${options.markerPath})`);

    return this.downloadToken(token, expiresAt);
  }

  @RPCMethod
  public async createPipeDownload(options: CreatePipeDownloadOptions): Promise<DownloadToken> {
    const { pluginId, pipeId, filename } = options;
    // both ids end up in a subject
    if (!isSubjectToken(pluginId) || !isSubjectToken(pipeId) || typeof filename !== 'string' || !filename) {
      throw new Error('Pipe download needs a plugin id, a pipe id and a filename');
    }

    const token = randomUUID();
    const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    const expiresAt = Date.now() + ttlMs;
    this.pipes.set(token, { pluginId, pipeId, filename, mimeType: options.mimeType ?? 'application/octet-stream', expiresAt });

    this.logger.debug(`Pipe download registered: ${token} -> ${filename} (expires in ${ttlMs}ms)`);

    return this.downloadToken(token, expiresAt);
  }

  @RPCMethod
  public async deleteDownload(token: string): Promise<void> {
    this.pipes.delete(token);
    const entry = this.registry.get(token);
    if (entry) {
      this.registry.delete(token);
      this.removePersistedEntry(token);
      await this.deleteEntryFile(entry);
    }
  }

  public createServerDownload(options: ServerDownloadOptions): DownloadToken {
    const token = randomUUID();
    const expiresAt = Date.now() + DEFAULT_TTL_MS;

    this.registry.set(token, {
      filePath: options.filePath,
      filename: options.filename,
      mimeType: options.mimeType,
      expiresAt,
      cleanup: 'on-download',
      owned: true,
      release: options.release,
    });

    return this.downloadToken(token, expiresAt);
  }

  public publicUrl(token: string): string {
    return this.buildPublicUrl(token);
  }

  public resolveLocalFile(token: string): string | null {
    const entry = this.registry.get(token);
    if (!entry || entry.owned || entry.remotePluginId || entry.streaming || Date.now() > entry.expiresAt) return null;
    return entry.filePath;
  }

  public async handleDownload(req: FastifyRequest<DownloadParamsRequest>, reply: FastifyReply): Promise<void> {
    const { token } = req.params;
    const pipe = this.pipes.get(token);
    if (pipe) {
      return this.handlePipeDownload(reply, token, pipe);
    }

    const entry = this.registry.get(token);

    if (!entry) {
      reply.code(404).send({ error: 'Download not found or expired' });
      return;
    }

    if (Date.now() > entry.expiresAt) {
      this.registry.delete(token);
      this.removePersistedEntry(token);
      this.deleteEntryFile(entry).catch(() => {});
      reply.code(404).send({ error: 'Download expired' });
      return;
    }

    if (entry.streaming) {
      return this.handleStreamDownload(req, reply, token, entry);
    }

    if (entry.remotePluginId) {
      return this.handleRemoteDownload(reply, token, entry);
    }

    const filePath = entry.owned ? entry.filePath : await this.allowedLocalPath(entry.filePath, true);
    if (!filePath || !existsSync(filePath)) {
      this.registry.delete(token);
      this.removePersistedEntry(token);
      reply.code(404).send({ error: 'File not found' });
      return;
    }

    const stat = statSync(filePath);

    reply.header('Content-Type', entry.mimeType);
    reply.header('Content-Disposition', attachmentHeader(entry.filename));
    reply.header('Content-Length', stat.size);

    const stream = createReadStream(filePath);

    if (entry.cleanup === 'on-download') {
      stream.on('end', () => {
        this.registry.delete(token);
        this.removePersistedEntry(token);
        this.deleteEntryFile(entry).catch(() => {});
      });
    }

    return reply.send(stream);
  }

  public async handleDownloadCheck(req: FastifyRequest<DownloadParamsRequest>, reply: FastifyReply): Promise<void> {
    const pipe = this.pipes.get(req.params.token);
    if (pipe && Date.now() <= pipe.expiresAt) {
      reply.header('Content-Type', pipe.mimeType);
      reply.header('Content-Disposition', attachmentHeader(pipe.filename));
      reply.send();
      return;
    }

    const entry = this.registry.get(req.params.token);
    const size = entry && Date.now() <= entry.expiresAt ? await this.availableSize(entry) : null;

    if (!entry || size === null) {
      reply.code(404).send({ error: 'Download not found or expired' });
      return;
    }

    reply.header('Content-Type', entry.mimeType);
    reply.header('Content-Disposition', attachmentHeader(entry.filename));
    if (size !== undefined) reply.header('Content-Length', size);
    reply.send();
  }

  private fileServeProxy(pluginId: string): Promisify<PluginFileServeInterface> {
    return this.proxyServer.proxy.createProxy<PluginFileServeInterface>(NamespaceManager.pluginFileServeRpc(pluginId));
  }

  private downloadToken(token: string, expiresAt: number): DownloadToken {
    return {
      token,
      url: `/api/download/${token}`,
      publicUrl: this.buildPublicUrl(token),
      expiresAt,
    };
  }

  private pipeProxy(pluginId: string): Promisify<PluginPipeInterface> {
    return this.proxyServer.proxy.createProxy<PluginPipeInterface>(NamespaceManager.pluginPipeRpc(pluginId));
  }

  private awaitDrain(res: ServerResponse, timeoutMs?: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const settle = (drained: boolean) => {
        clearTimeout(timer);
        res.off('drain', done);
        res.off('close', done);
        res.off('error', done);
        resolve(drained);
      };
      const done = () => settle(true);
      const timer = timeoutMs ? setTimeout(() => settle(false), timeoutMs) : undefined;
      res.once('drain', done);
      res.once('close', done);
      res.once('error', done);
    });
  }

  private async availableSize(entry: DownloadEntry): Promise<number | null | undefined> {
    if (entry.streaming) return undefined;

    if (entry.remotePluginId) {
      const remote = await this.fileServeProxy(entry.remotePluginId)
        .statFile(entry.filePath)
        .catch(() => null);
      return remote?.exists ? remote.size : null;
    }

    const filePath = entry.owned ? entry.filePath : await this.allowedLocalPath(entry.filePath, true);
    const info = filePath ? await stat(filePath).catch(() => null) : null;
    return info?.isFile() ? info.size : null;
  }

  private async handleRemoteDownload(reply: FastifyReply, token: string, entry: DownloadEntry): Promise<void> {
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
    reply.header('Content-Disposition', attachmentHeader(entry.filename));
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
    const externalUrl = inject('remoteAccessManager').getStatus().externalUrl;
    if (!externalUrl) return '';
    return `${externalUrl.replace(/\/+$/, '')}/api/download/${encodeURIComponent(token)}`;
  }

  private async restoreFromPersistedRegistry(): Promise<void> {
    const now = Date.now();
    let restored = 0;
    let evicted = 0;

    for (const entry of this.downloadsService.list()) {
      const token = entry._id;

      // rows written before paths were checked can hold any type
      if (typeof entry.filePath !== 'string' || (entry.markerPath != null && typeof entry.markerPath !== 'string')) {
        this.downloadsService.remove(token);
        evicted++;
        continue;
      }

      if (entry.streaming) {
        this.downloadsService.remove(token);
        await this.deleteLocalFile(entry.filePath);
        if (entry.markerPath) await this.deleteLocalFile(entry.markerPath);
        evicted++;
        continue;
      }

      if (now > entry.expiresAt) {
        this.downloadsService.remove(token);
        if (entry.cleanup !== 'never') await this.deleteLocalFile(entry.filePath);
        evicted++;
        continue;
      }

      if (!(await this.allowedLocalPath(entry.filePath, true))) {
        this.downloadsService.remove(token);
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

  private async handlePipeDownload(reply: FastifyReply, token: string, entry: PipeEntry): Promise<void> {
    // the bytes exist only while the plugin writes them, one request gets them
    this.pipes.delete(token);

    if (Date.now() > entry.expiresAt) {
      reply.code(404).send({ error: 'Download expired' });
      return;
    }

    const res = reply.raw;
    const plugin = this.pipeProxy(entry.pluginId);
    const chunks = plugin.pullPipe(entry.pipeId);
    const gone = new Promise<'gone'>((resolve) => res.once('close', () => resolve('gone')));

    // the pull that is open, 0 while the client takes its time
    let pull = 0;
    let pulls = 0;
    const watch = this.watchPipe(plugin, entry.pipeId, () => pull);

    let failure: unknown;
    try {
      for (;;) {
        pull = ++pulls;
        const step = chunks.next();
        // settled by the iterator's return() after the client left, nobody awaits it then
        step.catch(() => {});
        const next = await Promise.race([step, gone, watch.failed]);
        pull = 0;
        if (next === 'gone' || next.done) break;

        const chunk = next.value;
        if (!(chunk instanceof Uint8Array)) throw new Error(chunk.error);
        if (chunk.length === 0) continue;

        // headers wait for the first bytes, a download that fails before them gets a status instead of an empty file
        if (!res.headersSent) {
          res.writeHead(200, {
            ...this.corsHeaders(reply),
            'Content-Type': entry.mimeType,
            'Content-Disposition': attachmentHeader(entry.filename),
            'Cache-Control': 'no-cache',
          });
          reply.hijack();
        }

        if (!res.write(chunk) && !(await this.awaitDrain(res, this.pipeStallMs))) {
          throw new Error('the client stopped reading');
        }
      }
    } catch (err) {
      failure = err;
    } finally {
      watch.stop();
      // ends the plugin's side, also when it still writes
      await chunks.return(undefined).catch(() => {});
    }

    if (res.destroyed) return;

    if (!res.headersSent) {
      if (failure) this.logger.warn(`Pipe download failed: ${entry.filename}`, failure);
      reply.code(500).send({ error: 'Download failed' });
      return;
    }

    if (failure) {
      this.logger.warn(`Pipe download failed: ${entry.filename}`, failure);
      // cut off, so the client sees a failed download and not a short file that looks complete
      res.destroy();
      return;
    }

    res.end();
  }

  private watchPipe(plugin: Promisify<PluginPipeInterface>, pipeId: string, openPull: () => number): { failed: Promise<never>; stop: () => void } {
    let fail!: (err: unknown) => void;
    const failed = new Promise<never>((_, reject) => {
      fail = reject;
    });
    failed.catch(() => {});

    let seen: PipeState = 'writing';
    let seenPull = 0;
    // asked for the whole download: the plugin ends one it hears nothing about, and its answer shows a pull that never got through
    const timer = setInterval(() => {
      const pull = openPull();
      plugin.pipeState(pipeId).then((state) => {
        // twice in a row for the same pull, the client would wait forever
        if (pull !== 0 && pull === seenPull && state !== 'writing' && state === seen) {
          fail(new Error(state === 'gone' ? 'the plugin no longer writes the download' : 'the pull or its answer got lost on the way to the plugin'));
        }
        seen = state;
        seenPull = pull;
      }, fail);
    }, this.pipeProbeMs);

    return { failed, stop: () => clearInterval(timer) };
  }

  private async handleRemoteStreamDownload(req: FastifyRequest<DownloadParamsRequest>, reply: FastifyReply, token: string, entry: DownloadEntry): Promise<void> {
    const serve = this.fileServeProxy(entry.remotePluginId!);

    // with a marker the writer can take a while before the file appears, wait while it is alive
    const deadline = entry.markerPath ? entry.expiresAt : Date.now() + STREAM_FILE_WAIT_MS;
    let initial = await serve.statFile(entry.filePath).catch(() => ({ exists: false, size: 0 }));
    while (!initial.exists && Date.now() < deadline && !req.raw.destroyed) {
      if (entry.markerPath) {
        const marker = await serve.statFile(entry.markerPath).catch(() => ({ exists: false, size: 0 }));
        if (!marker.exists) {
          initial = await serve.statFile(entry.filePath).catch(() => ({ exists: false, size: 0 }));
          break;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, entry.markerPath ? STREAM_MARKER_WAIT_POLL_MS : STREAM_POLL_MS));
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
      ...this.corsHeaders(reply),
      'Content-Type': entry.mimeType,
      'Content-Disposition': attachmentHeader(entry.filename),
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

    const fileReady = await this.waitForStreamFile(req, entry);
    const filePath = fileReady ? await this.allowedLocalPath(entry.filePath, true) : undefined;
    if (!filePath) {
      this.registry.delete(token);
      this.removePersistedEntry(token);
      reply.code(404).send({ error: 'Export file not created' });
      return;
    }

    const res = reply.raw;
    const reqRaw = req.raw;

    res.writeHead(200, {
      ...this.corsHeaders(reply),
      'Content-Type': entry.mimeType,
      'Content-Disposition': attachmentHeader(entry.filename),
      'Cache-Control': 'no-cache',
    });

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
        this.deleteLocalFile(entry.filePath).catch(() => {});
      }
    };

    reqRaw.on('close', () => {
      destroyed = true;
    });

    try {
      fd = openSync(filePath, 'r');

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

  private async waitForStreamFile(req: FastifyRequest<DownloadParamsRequest>, entry: DownloadEntry): Promise<boolean> {
    // an episode export extracts clips before the output file exists, a fixed wait would 404
    if (!entry.markerPath) return this.waitForFile(entry.filePath, STREAM_FILE_WAIT_MS);

    while (Date.now() < entry.expiresAt && !req.raw.destroyed) {
      if (existsSync(entry.filePath)) return true;
      if (!existsSync(entry.markerPath)) break;
      await new Promise<void>((resolve) => setTimeout(resolve, STREAM_MARKER_WAIT_POLL_MS));
    }
    return existsSync(entry.filePath);
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
    this.recordingZones().catch(() => {});

    const now = Date.now();
    for (const [token, entry] of this.registry) {
      if (now > entry.expiresAt) {
        this.registry.delete(token);
        this.removePersistedEntry(token);
        this.deleteEntryFile(entry).catch(() => {});
        this.logger.debug(`Download expired and cleaned up: ${token}`);
      }
    }
    for (const [token, entry] of this.pipes) {
      if (now > entry.expiresAt) this.pipes.delete(token);
    }
  }

  private async deleteEntryFile(entry: DownloadEntry): Promise<void> {
    if (entry.owned) {
      await entry.release?.().catch((err) => this.logger.warn(`Failed to remove download file: ${entry.filePath}`, err));
      return;
    }
    if (entry.cleanup === 'never') return;
    if (entry.remotePluginId) {
      await this.deleteRemoteFile(entry).catch(() => {});
    } else {
      await this.deleteLocalFile(entry.filePath);
    }
  }

  private async assertLocalPath(filePath: unknown): Promise<void> {
    if (typeof filePath !== 'string' || !filePath || filePath.includes('\0') || !(await this.allowedLocalPath(filePath, true))) {
      throw new Error(`Download path ${String(filePath)} is outside the plugin storage and recording folders`);
    }
  }

  private async allowedLocalPath(filePath: string, followLink: boolean): Promise<string | undefined> {
    const target = await realTarget(resolve(filePath), followLink);
    if (!target) return undefined;

    for (const zone of await this.zones()) {
      const segments = segmentsBelow(zone.root, target);
      if (segments) return zoneAllows(zone.kind, segments) ? target : undefined;
    }
    return undefined;
  }

  private async zones(): Promise<Zone[]> {
    const { HOME_PATH, STORAGE_PATH, RESTORE_STAGING_PATH, TMP_PATH, PLUGINS_STORAGE_PATH } = this.configService;
    const loaded = [...(tryInject('pluginManager')?.plugins.values() ?? [])];
    const pluginFolders = [...new Set([...NVR_PLUGIN_NAMES, ...loaded.map((plugin) => plugin.pluginName)])].map((name) => join(PLUGINS_STORAGE_PATH, name));

    const zones = [
      ...(await realZones('closed', [HOME_PATH, STORAGE_PATH, RESTORE_STAGING_PATH, TMP_PATH, tmpdir()])),
      ...(await this.recordingZones()),
      ...[...this.exportFolders].map((root): Zone => ({ root, kind: 'exports' })),
      ...(await realZones('plugin', pluginFolders)),
      ...(await realZones('plugins', [PLUGINS_STORAGE_PATH])),
    ];
    return zones.sort((a, b) => b.root.length - a.root.length || ZONE_KINDS.indexOf(a.kind) - ZONE_KINDS.indexOf(b.kind));
  }

  private async recordingZones(): Promise<Zone[]> {
    const paths = [process.env.CAMERAUI_PLUGIN_NVR_STORAGE_PATH];
    for (const name of NVR_PLUGIN_NAMES) {
      const storagePath = join(this.configService.PLUGINS_STORAGE_PATH, name);
      paths.push(await readPluginSetting(storagePath, 'storagePath'), join(storagePath, 'recordings'));
    }

    const zones = await realZones(
      'closed',
      paths.filter((path): path is string => !!path && isAbsolute(path)),
    );
    // kept after a storage move, the NVR exports into the old folder until it has switched over
    for (const { root } of zones) this.exportFolders.add(join(root, EXPORTS_DIR));
    return zones;
  }

  private async deleteLocalFile(filePath: string): Promise<void> {
    const target = await this.allowedLocalPath(filePath, false);
    if (!target) {
      this.logger.debug(`Download cleanup skipped, not inside a download folder: ${filePath}`);
      return;
    }

    try {
      await unlink(target);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn(`Failed to delete download file: ${filePath}`, err);
      }
    }
  }

  private corsHeaders(reply: FastifyReply): Record<string, string> {
    const out: Record<string, string> = {};
    for (const name of ['access-control-allow-origin', 'access-control-allow-credentials', 'access-control-expose-headers', 'vary']) {
      const value = reply.getHeader(name);
      if (value != null) {
        out[name] = String(value);
      }
    }
    return out;
  }
}
