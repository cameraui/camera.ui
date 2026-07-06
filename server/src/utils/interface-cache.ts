import { copy, ensureDir, pathExists, readJson, remove, writeJson } from 'fs-extra/esm';
import { readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

interface ReleaseEntry {
  version: string;
  timestamp: number;
  files: string[];
}

const RELEASES_FILE = '.cui-releases.json';
const RETAINED_RELEASES = 2;

export async function syncInterfaceCache(sourceDir: string, cacheDir: string, version: string): Promise<void> {
  try {
    if (!(await pathExists(sourceDir))) {
      return;
    }

    await ensureDir(cacheDir);

    const sourceFiles = await walkFiles(sourceDir);
    const cacheFiles = (await walkFiles(cacheDir)).filter((rel) => rel !== RELEASES_FILE);

    if (cacheFiles.length === 0) {
      await copy(sourceDir, cacheDir, { overwrite: true });
      await writeReleases(cacheDir, [{ version, timestamp: Date.now(), files: sourceFiles }]);
      return;
    }

    for (const rel of sourceFiles) {
      const source = join(sourceDir, ...rel.split('/'));
      const dest = join(cacheDir, ...rel.split('/'));

      if (isAccumulating(rel)) {
        if (await pathExists(dest)) {
          continue;
        }
        await copy(source, dest, { overwrite: false });
      } else {
        await copy(source, dest, { overwrite: true });
      }
    }

    const releases = await readReleases(cacheDir);
    const newest = releases[releases.length - 1];
    if (newest?.version === version) {
      newest.timestamp = Date.now();
      newest.files = sourceFiles;
    } else {
      releases.push({ version, timestamp: Date.now(), files: sourceFiles });
    }

    const retained = releases.slice(-RETAINED_RELEASES);
    const keep = new Set<string>();
    for (const entry of retained) {
      for (const file of entry.files) {
        keep.add(file);
      }
    }

    for (const rel of cacheFiles) {
      if (!isAccumulating(rel) || keep.has(rel)) {
        continue;
      }
      await remove(join(cacheDir, ...rel.split('/')));
    }

    await writeReleases(cacheDir, retained);
  } catch {
    // ignore
  }
}

async function walkFiles(dir: string, base: string = dir): Promise<string[]> {
  if (!(await pathExists(dir))) {
    return [];
  }

  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(full, base)));
    } else if (entry.isFile()) {
      files.push(relative(base, full).split(sep).join('/'));
    }
  }

  return files;
}

function isAccumulating(relPath: string): boolean {
  if (relPath.startsWith('assets/')) {
    return true;
  }

  const name = relPath.split('/').pop()!;
  if (/^workbox-.+\.js$/i.test(name)) {
    return true;
  }

  return /[.-][a-f0-9]{8,}\.[a-z0-9]+$/i.test(name);
}

async function readReleases(cacheDir: string): Promise<ReleaseEntry[]> {
  const file = join(cacheDir, RELEASES_FILE);
  if (!(await pathExists(file))) {
    return [];
  }

  try {
    const data = await readJson(file);
    return Array.isArray(data) ? (data as ReleaseEntry[]) : [];
  } catch {
    return [];
  }
}

async function writeReleases(cacheDir: string, releases: ReleaseEntry[]): Promise<void> {
  await writeJson(join(cacheDir, RELEASES_FILE), releases, { spaces: 2 });
}
