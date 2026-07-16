import { getNpmPath } from '@camera.ui/common/node';
import { IS_ELECTRON } from '@camera.ui/common/utils';
import { TTLCache } from '@isaacs/ttlcache';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { platform } from 'node:os';
import { basename, dirname, join } from 'node:path';
import npmFetch from 'npm-registry-fetch';
import pacote from 'pacote';
import { gt, parse } from 'semver';

import { resolveNpmOptions } from './auth.js';

import type { AbbreviatedManifest, AbbreviatedPackument, ManifestResult, Options, Packument, PackumentResult } from 'pacote';

type FullPackument = Packument & PackumentResult & { description?: string };
type AbbrPackument = AbbreviatedPackument & PackumentResult;

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

const packumentCache = new TTLCache<string, AbbrPackument | FullPackument>({ ttl: PACKUMENT_TTL_MS, max: 200 });

interface PackumentOptions {
  full?: boolean;
  refresh?: boolean;
}

function npmOptions(extra?: Options): Options {
  return { ...resolveNpmOptions(), ...extra };
}

export async function getPackument(name: string, options: PackumentOptions & { full: true }): Promise<FullPackument>;
export async function getPackument(name: string, options?: PackumentOptions): Promise<AbbrPackument>;
export async function getPackument(name: string, options?: PackumentOptions): Promise<AbbrPackument | FullPackument> {
  const full = options?.full ?? false;
  const key = `${full ? 'full' : 'abbr'}:${name}`;

  if (!options?.refresh) {
    const cached = packumentCache.get(key);
    if (cached) {
      return cached;
    }
  }

  const packument: AbbrPackument | FullPackument = full
    ? await pacote.packument(name, { ...npmOptions(), fullMetadata: true as const })
    : await pacote.packument(name, npmOptions());

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

export async function getManifest(spec: string): Promise<AbbreviatedManifest & ManifestResult> {
  return pacote.manifest(spec, npmOptions());
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
  const result = (await npmFetch.json(`/-/v1/search?text=${encodeURIComponent(query)}&size=${size}`, npmOptions())) as {
    objects?: { package: NpmSearchObject }[];
  };

  return (result.objects ?? []).map((entry) => entry.package);
}

export async function extractPackage(spec: string, dest: string): Promise<void> {
  await pacote.extract(spec, dest, npmOptions());
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

    // Explicit either way so behavior is deterministic across npm versions:
    // older npm runs dependency scripts by default, npm v12+ blocks them by
    // default. A plugin that declares its own allowScripts policy gets npm's
    // enforcement (no flag); otherwise the dangerously flag keeps the
    // pre-v12 behavior the user consented to (--allow-scripts itself is
    // rejected in project-scoped installs).
    const scriptsFlag = allowScripts ? (declaresAllowScripts(packageDir) ? undefined : '--dangerously-allow-all-scripts') : '--ignore-scripts';

    const command = bundledNpmCli ? process.execPath : getNpmPath()[0];
    const args = [...(bundledNpmCli ? [bundledNpmCli] : []), 'install', ...(scriptsFlag ? [scriptsFlag] : []), '--omit=dev', '--include=prod', '--no-progress'];

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: 'production',
      npm_config_update_notifier: 'false',
      npm_config_prefer_online: 'true',
      npm_config_progress: 'false',
      npm_config_prefix: packageDir,
      npm_config_color: 'always',
      FORCE_COLOR: '1',
      ...(bundledNpmCli && IS_ELECTRON ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
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
