import { readJson, writeJson } from 'fs-extra/esm';
import { readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

const MARKER_FILE = '.cameraui-install.json';
const VENV_DIR = /^python(-electron)?-\d+\.\d+-/;
const REQUIREMENTS_LOCK = 'requirements-lock.txt';

export interface InstallArtifact {
  version: string;
  integrity?: string;
  tarball?: string;
  local?: boolean;
}

export async function readInstallMarker(installPath: string): Promise<InstallArtifact | undefined> {
  return readJson(join(installPath, MARKER_FILE)).catch(() => undefined);
}

export function readInstallMarkerSync(installPath: string): InstallArtifact | undefined {
  try {
    return JSON.parse(readFileSync(join(installPath, MARKER_FILE), 'utf8'));
  } catch {
    return undefined;
  }
}

export async function writeInstallMarker(installPath: string, artifact: InstallArtifact): Promise<void> {
  await writeJson(join(installPath, MARKER_FILE), artifact);
}

export async function pythonEnvEntries(installPath: string): Promise<string[]> {
  const entries = await readdir(installPath, { withFileTypes: true }).catch(() => []);
  return entries.filter((entry) => (entry.isDirectory() && VENV_DIR.test(entry.name)) || entry.name === REQUIREMENTS_LOCK).map((entry) => entry.name);
}
