import { Logger } from '@camera.ui/common/logger';
import { cutLogFile, rotateLogFile } from '@camera.ui/common/node';
import { createWriteStream, statSync } from 'node:fs';
import { rm, truncate } from 'node:fs/promises';
import { finished } from 'node:stream/promises';

import type { LogEntry, LogTransport } from '@camera.ui/common/logger';
import type { WriteStream } from 'node:fs';

const WRITE_PAUSE_MS = 30_000;
const MAX_PENDING_LINES = 5000;

export interface FileTransportOptions {
  filePath: string;
  maxSize: number;
  rotate?: boolean;
  bufferSize?: number;
  flushInterval?: number;
  onWarning?: (message: string) => void;
}

export class FileTransport implements LogTransport {
  public generation = Date.now();

  private stream?: WriteStream;
  private size = 0;
  private pending: string[] = [];
  private dropped = 0;
  private flushTimer?: NodeJS.Timeout;
  private busy?: Promise<void>;
  private pausedUntil = 0;
  private rotateWarned = false;
  private closed = false;

  private readonly filePath: string;
  private readonly maxSize: number;
  private readonly rotate: boolean;
  private readonly bufferSize: number;
  private readonly flushIntervalMs: number;

  constructor(private options: FileTransportOptions) {
    this.filePath = options.filePath;
    this.maxSize = options.maxSize;
    this.rotate = options.rotate ?? true;
    this.bufferSize = options.bufferSize ?? 1;
    this.flushIntervalMs = options.flushInterval ?? 100;

    this.openStream();
  }

  public get rotatedPath(): string {
    return `${this.filePath}.1`;
  }

  public write(entry: LogEntry): void {
    this.push(Logger.formatWithColors(entry) + '\n');
  }

  public writeHeader(title: string): void {
    const content = `${new Date().toLocaleString('en-US')}: ${title}`;
    const line = '-'.repeat(content.length + 3);

    this.push(`\n${line}\n${content.padEnd(line.length)}\n${line}\n\n`, true);
  }

  public async flush(): Promise<void> {
    this.flushPending();
  }

  public async close(): Promise<void> {
    if (this.closed) return;

    clearTimeout(this.flushTimer);
    while (this.busy) await this.busy;
    this.closed = true;

    if (this.pending.length && this.stream) {
      this.stream.write(this.pending.join(''));
      this.pending = [];
    }
    await this.closeStream();
  }

  public async sync(): Promise<void> {
    this.flushPending();
    while (this.busy) await this.busy;

    const stream = this.stream;
    if (!stream?.writable) return;
    await new Promise<void>((resolve) => stream.write('', () => resolve()));
  }

  public getFilePath(): string {
    return this.filePath;
  }

  public clear(): Promise<void> {
    return this.hold(async () => {
      this.pending = [];
      await rm(this.rotatedPath, { force: true });
      await truncate(this.filePath).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
      });
    });
  }

  public hold(task: () => Promise<void>): Promise<void> {
    const current = (this.busy ?? Promise.resolve()).then(async () => {
      await this.closeStream();
      try {
        await task();
      } finally {
        this.generation = Math.max(Date.now(), this.generation + 1);
        if (!this.closed) this.openStream();
      }
    });

    const settled: Promise<void> = current
      .catch(() => {})
      .then(() => {
        if (this.busy !== settled) return;
        this.busy = undefined;
        this.flushPending();
      });
    this.busy = settled;

    return current;
  }

  private push(text: string, immediate = false): void {
    if (this.closed) return;

    if (this.pending.length >= MAX_PENDING_LINES) {
      this.dropped++;
      return;
    }
    this.pending.push(text);

    if (immediate || this.pending.length >= this.bufferSize) {
      this.flushPending();
    } else {
      this.flushTimer ??= setTimeout(() => this.flushPending(), this.flushIntervalMs);
    }
  }

  private flushPending(): void {
    clearTimeout(this.flushTimer);
    this.flushTimer = undefined;

    if (this.closed || this.busy || !this.pending.length) return;

    if (Date.now() < this.pausedUntil) {
      this.dropped += this.pending.length;
      this.pending = [];
      return;
    }

    if (!this.stream) this.openStream();
    if (this.dropped) {
      this.pending.unshift(this.droppedNotice());
      this.dropped = 0;
    }

    const text = this.pending.join('');
    const bytes = Buffer.byteLength(text);
    if (this.size > 0 && this.size + bytes > this.maxSize) {
      this.hold(() => this.rotateFile()).catch(() => {});
      return;
    }

    this.pending = [];
    this.stream!.write(text);
    this.size += bytes;
  }

  private async rotateFile(): Promise<void> {
    try {
      if (!this.rotate) {
        await cutLogFile(this.filePath, Math.floor(this.maxSize / 2));
        return;
      }

      const { rotated, error } = await rotateLogFile(this.filePath, this.maxSize);
      if (!rotated) this.warnOnce(`Could not rotate ${this.filePath} (${error}), cut it in place instead`);
    } catch (error: any) {
      this.pause(`Could not shorten ${this.filePath} (${error.code ?? error.message}), writing pauses`);
    }
  }

  private openStream(): void {
    try {
      this.size = statSync(this.filePath).size;
    } catch {
      this.size = 0;
    }

    const stream = createWriteStream(this.filePath, { flags: 'a' });
    stream.on('error', (error: NodeJS.ErrnoException) => {
      if (this.stream === stream) this.stream = undefined;
      this.pause(`Could not write ${this.filePath} (${error.code ?? error.message}), writing pauses`);
    });
    this.stream = stream;
  }

  private async closeStream(): Promise<void> {
    const stream = this.stream;
    this.stream = undefined;
    if (!stream || stream.destroyed) return;

    stream.end();
    await finished(stream).catch(() => {});
  }

  private pause(message: string): void {
    const now = Date.now();
    if (now < this.pausedUntil) return;

    this.pausedUntil = now + WRITE_PAUSE_MS;
    console.warn(`${message} for ${WRITE_PAUSE_MS / 1000} s`);
  }

  private warnOnce(message: string): void {
    if (this.rotateWarned) return;

    this.rotateWarned = true;
    if (this.options.onWarning) {
      this.options.onWarning(message);
    } else {
      console.warn(message);
    }
  }

  private droppedNotice(): string {
    const notice = Logger.formatWithColors({
      timestamp: Date.now(),
      level: 'warn',
      prefix: 'camera.ui',
      message: `${this.dropped} log lines could not be written`,
      source: 'main',
      processId: process.pid,
    });
    return notice + '\n';
  }
}
