import { createReadStream } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';

const CHUNK_BYTES = 64 * 1024;
const SCAN_BYTES = 256 * 1024;
const HEAD_CHARS = 512;
const MAX_LINE_BYTES = 1024 * 1024;
const MAX_LINE_CHARS = 16_384;
const NEAREST_WINDOW_MS = 60_000;
const NEWLINE = 0x0a;
const ANSI = /\u001B\[[0-9;]*m/g;
const STAMP = /^\[(\d{2})\.(\d{2})\.(\d{4}), (\d{2}):(\d{2}):(\d{2})\]/;
const PROBLEM = /\u001B\[4[13]m (?:ERROR|WARN) /;

export interface LogPart {
  path: string;
  size: number;
}

export interface LogChunk {
  lines: string[];
  offsets: number[];
  start: number;
  end: number;
  size: number;
  targets?: number[];
  anchor?: number;
  missing?: boolean;
  firstAt?: number;
}

export interface LogChunkQuery {
  before?: number;
  after?: number;
}

interface Window {
  start: number;
  end: number;
  buffer: Buffer;
}

interface Entry {
  positions: number[];
  key: string;
  ms: number;
  problem: boolean;
}

export async function logParts(path: string): Promise<LogPart[]> {
  const parts: LogPart[] = [];
  for (const file of [`${path}.1`, path]) {
    const size = await stat(file).then(
      (info) => info.size,
      () => 0,
    );
    if (size > 0) parts.push({ path: file, size });
  }
  return parts;
}

export async function readLogChunk(path: string, query: LogChunkQuery = {}): Promise<LogChunk> {
  const parts = await logParts(path);
  const size = totalSize(parts);

  const window = query.after !== undefined ? await readAfter(parts, size, query.after, CHUNK_BYTES) : await readBefore(parts, size, query.before ?? size, CHUNK_BYTES);
  return toChunk(window, size);
}

export async function readLogAround(path: string, at: number): Promise<LogChunk> {
  const parts = await logParts(path);
  const size = totalSize(parts);
  const found = await locate(parts, at);

  const anchor = found.missing ? 0 : (found.targets[0] ?? found.anchor ?? size);
  const head = await readBefore(parts, size, anchor, CHUNK_BYTES / 2);
  const tail = await readAfter(parts, size, anchor, CHUNK_BYTES / 2);
  const window = dropHalfLine({ start: head.start, end: tail.end, buffer: Buffer.concat([head.buffer, tail.buffer]) });
  const chunk = { ...splitLines(window), start: head.start, end: window.end, size };

  if (found.missing) {
    return { ...chunk, anchor: 0, missing: true, firstAt: found.firstAt };
  }

  const lineOf = (position: number) => lineIndex(window.buffer, position - window.start);
  const targets = found.targets.filter((position) => position >= window.start && position < window.end).map(lineOf);
  return { ...chunk, targets, anchor: anchor >= window.start ? lineOf(Math.min(anchor, window.end - 1)) : 0 };
}

export async function readLogTail(path: string, bytes: number): Promise<string> {
  const parts = await logParts(path);
  const size = totalSize(parts);
  const window = await readBefore(parts, size, size, bytes);
  return dropHalfLine(window).buffer.toString('utf8');
}

export function createLogDownload(path: string): Readable {
  return Readable.from(
    // eslint-disable-next-line @stylistic/generator-star-spacing
    (async function* () {
      for (const part of await logParts(path)) {
        for await (const data of createReadStream(part.path, { end: part.size - 1 })) {
          yield (data as Buffer).toString('utf8').replace(ANSI, '');
        }
      }
    })(),
  );
}

function totalSize(parts: LogPart[]): number {
  return parts.reduce((sum, part) => sum + part.size, 0);
}

async function readRange(parts: LogPart[], from: number, to: number): Promise<Buffer> {
  const buffers: Buffer[] = [];
  let offset = 0;

  for (const part of parts) {
    const partStart = offset;
    offset += part.size;

    const start = Math.max(from, partStart);
    const end = Math.min(to, offset);
    if (start >= end) continue;

    const handle = await open(part.path, 'r');
    try {
      const buffer = Buffer.alloc(end - start);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, start - partStart);
      buffers.push(buffer.subarray(0, bytesRead));
    } finally {
      await handle.close();
    }
  }

  return Buffer.concat(buffers);
}

async function readBefore(parts: LogPart[], size: number, position: number, bytes: number): Promise<Window> {
  const end = Math.min(Math.max(position, 0), size);
  let start = Math.max(0, end - bytes);
  let buffer = await readRange(parts, start, end);

  while (start > 0) {
    const newline = buffer.indexOf(NEWLINE);
    if (newline !== -1 && newline < buffer.length - 1) {
      return { start: start + newline + 1, end, buffer: buffer.subarray(newline + 1) };
    }
    if (end - start >= MAX_LINE_BYTES) break;

    const from = Math.max(0, start - bytes);
    buffer = Buffer.concat([await readRange(parts, from, start), buffer]);
    start = from;
  }

  return { start, end, buffer };
}

async function readAfter(parts: LogPart[], size: number, position: number, bytes: number): Promise<Window> {
  const start = Math.min(Math.max(position, 0), size);
  let end = Math.min(size, start + bytes);
  let buffer = await readRange(parts, start, end);

  while (end < size) {
    const newline = buffer.lastIndexOf(NEWLINE);
    if (newline !== -1) {
      return { start, end: start + newline + 1, buffer: buffer.subarray(0, newline + 1) };
    }
    if (end - start >= MAX_LINE_BYTES) break;

    const to = Math.min(size, end + bytes);
    buffer = Buffer.concat([buffer, await readRange(parts, end, to)]);
    end = to;
  }

  return { start, end, buffer };
}

function dropHalfLine(window: Window): Window {
  // files cut in place by older versions can start in the middle of a line, chunks still report start 0 for it
  if (window.start !== 0) return window;

  const newline = window.buffer.indexOf(NEWLINE);
  if (newline <= 0) return window;

  const first = window.buffer.toString('utf8', 0, newline);
  if (STAMP.test(first) || /^-+$/.test(first)) return window;

  return { start: newline + 1, end: window.end, buffer: window.buffer.subarray(newline + 1) };
}

function toChunk(window: Window, size: number): LogChunk {
  const trimmed = dropHalfLine(window);
  return { ...splitLines(trimmed), start: window.start, end: trimmed.end, size };
}

function splitLines(window: Window): { lines: string[]; offsets: number[] } {
  const lines: string[] = [];
  const offsets: number[] = [];
  const { buffer } = window;

  let lineStart = 0;
  while (lineStart < buffer.length) {
    const newline = buffer.indexOf(NEWLINE, lineStart);
    const lineEnd = newline === -1 ? buffer.length : newline;
    const line = buffer.toString('utf8', lineStart, lineEnd).replace(/\r$/, '');

    lines.push(line.length > MAX_LINE_CHARS ? `${line.slice(0, MAX_LINE_CHARS)}\u001B[0m …` : line);
    offsets.push(window.start + lineStart);
    lineStart = lineEnd + 1;
  }
  return { lines, offsets };
}

function lineIndex(buffer: Buffer, offset: number): number {
  let count = 0;
  let index = buffer.indexOf(NEWLINE);
  while (index !== -1 && index < offset) {
    count++;
    index = buffer.indexOf(NEWLINE, index + 1);
  }
  return count;
}

function stampKey(at: number): string {
  const date = new Date(at);
  const pad = (value: number) => value.toString().padStart(2, '0');
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}, ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function stampTime(stamp: string): number | undefined {
  return parseStamp(`[${stamp}]`)?.ms;
}

function parseStamp(line: string): { key: string; ms: number } | undefined {
  const match = STAMP.exec(line);
  if (!match) return undefined;

  const [, day, month, year, hours, minutes, seconds] = match.map(Number);
  return { key: match[0].slice(1, -1), ms: new Date(year, month - 1, day, hours, minutes, seconds).getTime() };
}

// eslint-disable-next-line @stylistic/generator-star-spacing
async function* scanLines(parts: LogPart[]): AsyncGenerator<{ position: number; line: string }> {
  let position = 0;
  let carry = Buffer.alloc(0);
  const size = totalSize(parts);

  for (let offset = 0; offset < size; offset += SCAN_BYTES) {
    const buffer = Buffer.concat([carry, await readRange(parts, offset, Math.min(size, offset + SCAN_BYTES))]);
    let lineStart = 0;
    let newline = buffer.indexOf(NEWLINE);

    while (newline !== -1) {
      yield { position: position + lineStart, line: buffer.toString('utf8', lineStart, Math.min(newline, lineStart + HEAD_CHARS)) };
      lineStart = newline + 1;
      newline = buffer.indexOf(NEWLINE, lineStart);
    }

    position += lineStart;
    carry = buffer.subarray(lineStart);
  }

  if (carry.length) {
    yield { position, line: carry.toString('utf8', 0, Math.min(carry.length, HEAD_CHARS)) };
  }
}

async function locate(parts: LogPart[], at: number): Promise<{ targets: number[]; anchor?: number; missing: boolean; firstAt?: number }> {
  const key = stampKey(at);
  const second = Math.floor(at / 1000) * 1000;
  const found: { matched: number[]; run?: number[]; nearest?: Entry; distance: number; anchor?: number; firstAt?: number } = { matched: [], distance: Infinity };

  const settle = (entry: Entry) => {
    if (entry.key === key) {
      found.run ??= [];
      if (entry.problem) found.run.push(...entry.positions);
    } else {
      // the same local second exists twice when the clock goes back, the later one wins
      if (found.run?.length) found.matched = found.run;
      found.run = undefined;
    }

    const distance = Math.abs(entry.ms - second);
    if (entry.problem && distance <= NEAREST_WINDOW_MS && distance <= found.distance) {
      found.nearest = entry;
      found.distance = distance;
    }
    if (found.anchor === undefined && entry.ms >= second) found.anchor = entry.positions[0];
  };

  let current: Entry | undefined;
  for await (const { position, line } of scanLines(parts)) {
    const stamp = parseStamp(line);
    if (!stamp) {
      current?.positions.push(position);
      continue;
    }

    if (current) settle(current);
    found.firstAt ??= stamp.ms;
    current = { positions: [position], key: stamp.key, ms: stamp.ms, problem: PROBLEM.test(line) };
  }
  if (current) settle(current);
  if (found.run?.length) found.matched = found.run;

  if (found.firstAt === undefined || second < found.firstAt) {
    return { targets: [], missing: true, firstAt: found.firstAt };
  }

  const targets = found.matched.length ? found.matched : (found.nearest?.positions ?? []);
  return { targets, anchor: found.anchor, missing: false, firstAt: found.firstAt };
}
