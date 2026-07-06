import { Logger } from '@camera.ui/common/logger';
import { pathExists } from 'fs-extra/esm';
import { createWriteStream, ftruncate, read } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import { promisify } from 'node:util';

import type { LogEntry, LogTransport } from '@camera.ui/common/logger';
import type { WriteStream } from 'node:fs';

const truncatePromise = promisify(ftruncate);
const readPromise = promisify(read);

export interface FileTransportOptions {
  filePath: string;
  maxSize?: number;
  truncateSize?: number;
  truncateInterval?: number;
  bufferSize?: number;
  flushInterval?: number;
}

export class FileTransport implements LogTransport {
  private stream?: WriteStream;
  private buffer: LogEntry[] = [];
  private flushTimer?: NodeJS.Timeout;
  private truncateTimer?: NodeJS.Timeout;
  private closed = false;

  private readonly filePath: string;
  private readonly maxSize: number;
  private readonly truncateSize: number;
  private readonly truncateIntervalMs: number;
  private readonly bufferSize: number;
  private readonly flushIntervalMs: number;

  constructor(options: FileTransportOptions) {
    this.filePath = options.filePath;
    this.maxSize = options.maxSize ?? 1000000; // ~1 MB
    this.truncateSize = options.truncateSize ?? 200000; // ~200 KB
    this.truncateIntervalMs = options.truncateInterval ?? 1000 * 60 * 60 * 2; // 2 hours
    this.bufferSize = options.bufferSize ?? 1; // Immediate write by default
    this.flushIntervalMs = options.flushInterval ?? 100;

    this.initStream();
    this.startTruncateTimer();
  }

  public write(entry: LogEntry): void {
    if (this.closed) return;

    this.buffer.push(entry);

    if (this.buffer.length >= this.bufferSize) {
      this.flushSync();
    } else {
      this.scheduleFlush();
    }
  }

  public writeHeader(title: string): void {
    if (this.closed || !this.stream?.writable) return;

    const date = new Date().toLocaleString('en-US');
    const content = `${date}: ${title}`;
    const lineLength = content.length + 3;
    const line = '-'.repeat(lineLength);

    this.stream.write(`\n${line}\n`);
    this.stream.write(content.padEnd(lineLength));
    this.stream.write(`\n${line}\n\n`);
  }

  public async flush(): Promise<void> {
    if (this.closed) return;

    clearTimeout(this.flushTimer);
    this.flushTimer = undefined;

    const entries = this.buffer.splice(0);
    if (entries.length === 0) return;

    for (const entry of entries) {
      this.writeEntry(entry);
    }
  }

  private flushSync(): void {
    clearTimeout(this.flushTimer);
    this.flushTimer = undefined;

    const entries = this.buffer.splice(0);
    for (const entry of entries) {
      this.writeEntry(entry);
    }
  }

  public async close(): Promise<void> {
    if (this.closed) return;

    this.closed = true;
    clearTimeout(this.flushTimer);
    clearInterval(this.truncateTimer);

    await this.flush();

    return new Promise((resolve) => {
      if (this.stream) {
        this.stream.end(() => {
          this.stream = undefined;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  public getFilePath(): string {
    return this.filePath;
  }

  private initStream(): void {
    this.stream = createWriteStream(this.filePath, { flags: 'a' });

    this.stream.on('error', (error) => {
      console.error(`FileTransport error for ${this.filePath}:`, error.message);
    });
  }

  private writeEntry(entry: LogEntry): void {
    if (!this.stream?.writable) return;

    try {
      // formatWithColors preserves ANSI codes for xterm.js display
      const text = Logger.formatWithColors(entry);
      this.stream.write(text + '\n');
    } catch {
      // ignore write errors
    }
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;

    this.flushTimer = setTimeout(() => {
      this.flushSync();
    }, this.flushIntervalMs);
  }

  private startTruncateTimer(): void {
    this.truncateLog();

    this.truncateTimer = setInterval(() => {
      this.truncateLog();
    }, this.truncateIntervalMs);
  }

  private async truncateLog(): Promise<void> {
    if (this.closed) return;
    if (!(await pathExists(this.filePath))) return;

    try {
      const logStats = await stat(this.filePath);

      if (logStats.size < this.maxSize) {
        return;
      }

      const logStartPosition = logStats.size - this.truncateSize;
      const logBuffer = Buffer.alloc(this.truncateSize);
      const fileHandle = await open(this.filePath, 'r+');

      try {
        await readPromise(fileHandle.fd, logBuffer, 0, this.truncateSize, logStartPosition);
        await truncatePromise(fileHandle.fd, 0);
        await fileHandle.write(logBuffer, 0, this.truncateSize, 0);
      } finally {
        await fileHandle.close();
      }
    } catch {
      // ignore truncation errors
    }
  }
}
