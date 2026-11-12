import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import type { WorkerPlatform } from '../workers/types.js';

export interface PlatformRequirement {
  os?: string[];
  cpu?: string[];
  libc?: string[];
}

let cachedMusl: boolean | undefined;

function matchesNpmList(list: string[] | undefined, value: string): boolean {
  if (!list?.length) {
    return true;
  }

  const negations = list.filter((entry) => entry.startsWith('!')).map((entry) => entry.slice(1));
  const positives = list.filter((entry) => !entry.startsWith('!'));

  if (negations.includes(value)) {
    return false;
  }

  if (positives.length === 0) {
    return true;
  }

  return positives.includes(value);
}

export function isMusl(): boolean {
  cachedMusl ??= detectMusl();
  return cachedMusl;
}

export function hostPlatform(): WorkerPlatform {
  if (process.platform !== 'linux') {
    return { os: process.platform, arch: process.arch };
  }
  return { os: process.platform, arch: process.arch, libc: isMusl() ? 'musl' : 'glibc' };
}

export function platformRequirement(pkg: { os?: string[]; cpu?: string[]; cameraui?: { libc?: string[] } }): PlatformRequirement {
  return { os: pkg.os, cpu: pkg.cpu, libc: pkg.cameraui?.libc };
}

export function isPlatformCompatible(requirement: PlatformRequirement, host: WorkerPlatform = hostPlatform()): boolean {
  // libc only applies on linux, and older workers don't report it
  const libcMatches = !host.libc || matchesNpmList(requirement.libc, host.libc);
  return matchesNpmList(requirement.os, host.os) && matchesNpmList(requirement.cpu, host.arch) && libcMatches;
}

export function describePlatformRequirement(requirement: PlatformRequirement): string {
  const parts: string[] = [];
  if (requirement.os?.length) parts.push(`os=[${requirement.os.join(', ')}]`);
  if (requirement.cpu?.length) parts.push(`cpu=[${requirement.cpu.join(', ')}]`);
  if (requirement.libc?.length) parts.push(`libc=[${requirement.libc.join(', ')}]`);
  return parts.length ? parts.join(' ') : 'any platform';
}

export function describeHost(host: WorkerPlatform = hostPlatform()): string {
  return [host.os, host.arch, host.libc].filter(Boolean).join('/');
}

function detectMusl(): boolean {
  if (process.platform !== 'linux') {
    return false;
  }

  try {
    if (readFileSync('/usr/bin/ldd', 'utf-8').includes('musl')) {
      return true;
    }
  } catch {
    // ignore
  }

  try {
    if (execSync('ldd --version 2>&1', { encoding: 'utf-8' }).includes('musl')) {
      return true;
    }
  } catch {
    // ignore
  }

  return false;
}
