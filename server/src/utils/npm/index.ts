import { npmCommand } from '@camera.ui/common/node';
import { IS_ELECTRON } from '@camera.ui/common/utils';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { platform } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { gt, parse } from 'semver';

import { TtlCache } from '../ttl-cache.js';
import { nerfDart } from './auth.js';
import { extractTarball, fetchPackument, markBins, readTarballPackageJson, registryFor, resolveManifest, searchRegistry, unpackTarball } from './registry.js';

import type { PackageManifest, Packument } from './registry.js';

const __require = createRequire(import.meta.url);

export interface UpdateCheckResult {
  updateAvailable: boolean;
  betaUpdateAvailable: boolean;
  latestVersion?: string;
}

export interface NpmSearchObject {
  name: string;
  version: string;
  description?: string;
  keywords?: string[];
  links?: Record<string, string>;
  author?: { name?: string };
  publisher?: { username?: string };
  date?: string;
}

const DEP_INSTALL_TIMEOUT_MS = 5 * 60 * 1000;
const PACKUMENT_TTL_MS = 60 * 1000;

const packumentCache = new TtlCache<string, Packument>({ ttl: PACKUMENT_TTL_MS, max: 200 });

interface PackumentOptions {
  full?: boolean;
  refresh?: boolean;
}

function parseSpec(spec: string): { name: string; wanted: string } {
  const at = spec.lastIndexOf('@');
  if (at <= 0) {
    return { name: spec, wanted: 'latest' };
  }

  return { name: spec.slice(0, at), wanted: spec.slice(at + 1) || 'latest' };
}

export async function getPackument(name: string, options?: PackumentOptions): Promise<Packument> {
  const full = options?.full ?? false;
  const key = `${full ? 'full' : 'abbr'}:${name}`;

  if (!options?.refresh) {
    const cached = packumentCache.get(key);
    if (cached) {
      return cached;
    }
  }

  const packument = await fetchPackument(name, full);

  packumentCache.set(key, packument);
  return packument;
}

export function invalidatePackage(name?: string): void {
  if (!name) {
    packumentCache.clear();
    return;
  }

  packumentCache.delete(`abbr:${name}`);
  packumentCache.delete(`full:${name}`);
}

export async function getDistTags(name: string): Promise<Record<string, string>> {
  const packument = await getPackument(name);
  return packument['dist-tags'] ?? {};
}

export async function getFullManifest(spec: string): Promise<PackageManifest> {
  const { name, wanted } = parseSpec(spec);
  const packument = await getPackument(name, { full: true });

  return resolveManifest(packument, spec, wanted);
}

export async function getVersionsAndDistTags(name: string): Promise<{ versions: string[]; 'dist-tags': Record<string, string> }> {
  const packument = await getPackument(name);
  return {
    versions: Object.keys(packument.versions ?? {}).reverse(),
    'dist-tags': packument['dist-tags'] ?? {},
  };
}

export async function checkForUpdate(name: string, currentVersion: string, prereleaseTag = 'beta', includePrerelease = false): Promise<UpdateCheckResult> {
  const tags = await getDistTags(name);
  const latest = tags.latest;
  const prerelease = tags[prereleaseTag];

  const updateAvailable = latest ? gt(latest, currentVersion) : false;

  let betaUpdateAvailable = false;

  if (!updateAvailable && prerelease) {
    const onPrereleaseTrack = parse(currentVersion)?.prerelease[0] === prereleaseTag;
    if ((onPrereleaseTrack || includePrerelease) && gt(prerelease, currentVersion)) {
      betaUpdateAvailable = true;
    }
  }

  const latestVersion = betaUpdateAvailable ? prerelease : latest;

  return { updateAvailable, betaUpdateAvailable, latestVersion };
}

export async function searchPackages(query: string, size = 250): Promise<NpmSearchObject[]> {
  return searchRegistry(query, size);
}

export async function extractPackage(spec: string, dest: string): Promise<PackageManifest> {
  const { name, wanted } = parseSpec(spec);
  const packument = await getPackument(name, { refresh: true });
  const manifest = resolveManifest(packument, spec, wanted);

  await extractTarball(manifest, dest);
  return manifest;
}

export async function extractLocalPackage(file: string, dest: string): Promise<void> {
  const { name, bin } = await readTarballPackageJson(file);
  await unpackTarball(file, dest, { name, bin });
}

export async function extractArtifact(
  name: string,
  version: string,
  artifact: { integrity?: string; tarball?: string },
  dest: string,
  signal?: AbortSignal,
): Promise<PackageManifest> {
  let manifest: PackageManifest;
  try {
    manifest = resolveManifest(await getPackument(name, { refresh: true }), `${name}@${version}`, version);
  } catch (error) {
    if (!artifact.tarball) throw error;
    return extractForeignTarball({ name, version, dist: { tarball: artifact.tarball, integrity: artifact.integrity } }, dest, signal);
  }

  if (artifact.integrity && manifest.dist.integrity && manifest.dist.integrity !== artifact.integrity) {
    throw Object.assign(new Error(`The registry serves another build of ${name}@${version} than the master installed`), { code: 'EINTEGRITY' });
  }
  await extractTarball(manifest, dest, signal);
  return manifest;
}

async function extractForeignTarball(manifest: PackageManifest, dest: string, signal?: AbortSignal): Promise<PackageManifest> {
  await extractTarball(manifest, dest, signal);
  const { bin } = JSON.parse(readFileSync(join(dest, 'package.json'), 'utf8')) as Pick<PackageManifest, 'bin'>;
  await markBins({ ...manifest, bin }, dest);
  return { ...manifest, bin };
}

function envRegistryToken(): NodeJS.ProcessEnv {
  const token = [process.env.CAMERAUI_NPM_TOKEN, process.env.NPM_TOKEN].find(Boolean);
  if (!token) {
    return {};
  }

  return { [`npm_config_${nerfDart(registryFor())}:_authToken`]: token };
}

export interface ProcessTracker {
  add: (proc: { pid: number; startTime: number; command: string; args: string[] }) => void;
  remove: (pid: number) => void;
}

function declaresAllowScripts(packageDir: string): boolean {
  try {
    const pkg = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')) as { allowScripts?: unknown };
    return !!pkg.allowScripts && typeof pkg.allowScripts === 'object' && Object.keys(pkg.allowScripts).length > 0;
  } catch {
    return false;
  }
}

export function installDependencies(packageDir: string, allowScripts: boolean, onOutput?: (chunk: string) => void, tracker?: ProcessTracker): Promise<void> {
  return new Promise((resolve, reject) => {
    let bundledNpmCli: string | undefined;
    try {
      bundledNpmCli = join(dirname(__require.resolve('npm/package.json')), 'bin', 'npm-cli.js');
    } catch {
      bundledNpmCli = undefined;
    }

    // explicit, npm 12 blocks dependency scripts by default and rejects --allow-scripts in project installs
    const scriptsFlag = allowScripts ? (declaresAllowScripts(packageDir) ? undefined : '--dangerously-allow-all-scripts') : '--ignore-scripts';

    const npm = bundledNpmCli ? { command: process.execPath, args: [bundledNpmCli] } : npmCommand();
    const command = npm.command;
    const args = [...npm.args, 'install', ...(scriptsFlag ? [scriptsFlag] : []), '--omit=dev', '--include=prod', '--no-progress'];

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: 'production',
      npm_config_update_notifier: 'false',
      npm_config_prefer_online: 'true',
      npm_config_progress: 'false',
      npm_config_prefix: packageDir,
      npm_config_color: 'always',
      FORCE_COLOR: '1',
      ...(command === process.execPath && IS_ELECTRON ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
      ...envRegistryToken(),
    };

    if (platform() !== 'win32' && basename(packageDir) === 'lib') {
      env.npm_config_prefix = dirname(packageDir);
    }

    const child = spawn(command, args, { cwd: packageDir, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });

    const childPID = child.pid;
    if (childPID) {
      tracker?.add({ pid: childPID, startTime: Date.now(), command, args });
    }

    const handleChunk = (data: Buffer) => onOutput?.(data.toString());
    child.stdout.on('data', handleChunk);
    child.stderr.on('data', handleChunk);

    const timeoutTimer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('Operation timed out after 5 minutes'));
    }, DEP_INSTALL_TIMEOUT_MS);

    child.on('close', (code) => {
      clearTimeout(timeoutTimer);
      if (childPID) {
        tracker?.remove(childPID);
      }
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Operation failed with exit code ${code}. Please review log for details.`));
      }
    });

    child.on('error', (err) => {
      clearTimeout(timeoutTimer);
      if (childPID) {
        tracker?.remove(childPID);
      }
      reject(new Error(`Failed to start process: ${err.message}`));
    });
  });
}
