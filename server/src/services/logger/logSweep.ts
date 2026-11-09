import { cutLogFile } from '@camera.ui/common/node';
import { readdir, rm, stat } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

const FOLDER_CAP = 300 * 1024 * 1024;
const OWN_FILE = /^(camera|plugin|system)-(.+)\.log(\.1)?$/;

export interface KnownLogIds {
  cameras: Set<string>;
  plugins: Set<string>;
}

export interface LogSweepOptions {
  logsPath: string;
  mainLogPath: string;
  known?: KnownLogIds;
  maxIdleMs?: number;
  sizeOf: (path: string) => number;
  isOpen: (path: string) => boolean;
  alter: (path: string, task: () => Promise<void>) => Promise<void>;
  warn: (message: string) => void;
}

interface LogFile {
  path: string;
  base: string;
  kind?: string;
  id?: string;
  rotated: boolean;
  size: number;
  mtimeMs: number;
}

export async function sweepLogs(options: LogSweepOptions): Promise<void> {
  let files = await listLogFiles(options);

  const orphans = files.filter((file) => isOrphan(file, options));
  for (const file of orphans) {
    await rm(file.path, { force: true });
  }
  if (orphans.length) {
    options.warn(`Removed ${orphans.length} log files of cameras or plugins that no longer exist`);
    files = files.filter((file) => !orphans.includes(file));
  }

  for (const file of files) {
    const limit = options.sizeOf(file.base);
    if (file.size <= limit * 2) continue;

    await options.alter(file.path, () => cutLogFile(file.path, limit));
    options.warn(`Shortened ${basename(file.path)}, it had grown to ${megabytes(file.size)}`);
    file.size = limit;
  }

  let total = files.reduce((sum, file) => sum + file.size, 0);
  if (total <= FOLDER_CAP) return;

  const startTotal = total;
  const bySize = (a: LogFile, b: LogFile) => b.size - a.size;
  for (const file of files.filter((entry) => entry.rotated).sort(bySize)) {
    if (total <= FOLDER_CAP) break;
    await options.alter(file.path, () => rm(file.path, { force: true }));
    total -= file.size;
  }
  for (const file of files.filter((entry) => !entry.rotated).sort(bySize)) {
    if (total <= FOLDER_CAP) break;
    const keep = Math.floor(options.sizeOf(file.base) / 2);
    if (file.size <= keep) continue;
    await options.alter(file.path, () => cutLogFile(file.path, keep));
    total -= file.size - keep;
  }
  options.warn(`Logs took ${megabytes(startTotal)}, older parts were removed to stay under ${megabytes(FOLDER_CAP)}`);
}

async function listLogFiles(options: LogSweepOptions): Promise<LogFile[]> {
  const names = await readdir(options.logsPath).catch(() => [] as string[]);
  const candidates = names.filter((name) => OWN_FILE.test(name)).map((name) => join(options.logsPath, name));
  candidates.push(options.mainLogPath, `${options.mainLogPath}.1`);

  const files: LogFile[] = [];
  for (const path of candidates) {
    const info = await stat(path).catch(() => undefined);
    if (!info?.isFile()) continue;

    const rotated = path.endsWith('.1');
    const base = rotated ? path.slice(0, -2) : path;
    const match = dirname(path) === options.logsPath ? OWN_FILE.exec(basename(path)) : null;
    files.push({ path, base, kind: match?.[1], id: match?.[2], rotated, size: info.size, mtimeMs: info.mtimeMs });
  }
  return files;
}

function isOrphan(file: LogFile, options: LogSweepOptions): boolean {
  if ((file.kind !== 'camera' && file.kind !== 'plugin') || !file.id || options.isOpen(file.base)) return false;

  if (options.known) {
    const ids = file.kind === 'camera' ? options.known.cameras : options.known.plugins;
    return !ids.has(file.id);
  }
  return options.maxIdleMs !== undefined && Date.now() - file.mtimeMs > options.maxIdleMs;
}

function megabytes(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}
