import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { compareDatabaseVersions } from '../version.js';

import type { Migration } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function loadMigrations(): Promise<Migration[]> {
  const allFiles = readdirSync(__dirname);
  const pattern = /^v\d+-\d+-\d+(-\d+)?\.[jt]s$/;

  const jsFiles = new Set(allFiles.filter((f) => f.endsWith('.js')));
  const files = allFiles.filter((f) => pattern.test(f) && !(f.endsWith('.ts') && jsFiles.has(f.replace(/\.ts$/, '.js'))));

  const migrations: Migration[] = [];
  for (const file of files) {
    const mod = await import(pathToFileURL(join(__dirname, file)).href);
    migrations.push(mod.default);
  }
  return migrations.sort((a, b) => compareDatabaseVersions(a.version, b.version));
}
