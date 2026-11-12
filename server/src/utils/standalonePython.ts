import { execSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { mkdtemp, rename, rm } from 'node:fs/promises';
import { arch, platform } from 'node:os';
import { join } from 'node:path';
import { extract } from 'tar';

import { download, fetchText } from './npm/registry.js';
import { isMusl } from './platform.js';

import type { PythonVersion } from '@camera.ui/sdk';

const RELEASE = '20261110';
const RELEASE_URL = `https://github.com/astral-sh/python-build-standalone/releases/download/${RELEASE}`;

const BUILDS: Record<PythonVersion, string> = {
  3.11: '3.11.18',
  3.12: '3.12.16',
  3.13: '3.13.18',
  3.14: '3.14.10',
};

const CPUS: Record<string, string> = { x64: 'x86_64', arm64: 'aarch64' };
const SYSTEMS: Record<string, string> = { darwin: 'apple-darwin', win32: 'pc-windows-msvc', linux: 'unknown-linux-gnu' };

export class StandalonePython {
  public readonly version: string;
  public readonly target = buildTarget();
  public readonly extractPath: string;

  constructor(
    minor: PythonVersion,
    private installDir: string,
  ) {
    this.version = BUILDS[minor];
    this.extractPath = join(installDir, `cpython-${this.version}-${this.target}`);
  }

  public get executablePath(): string {
    return platform() === 'win32' ? join(this.extractPath, 'python.exe') : join(this.extractPath, 'bin', 'python3');
  }

  public isInstalled(): boolean {
    return existsSync(this.executablePath);
  }

  public async install(): Promise<void> {
    const archive = `cpython-${this.version}+${RELEASE}-${this.target}-install_only_stripped.tar.gz`;
    const staging = await mkdtemp(join(this.installDir, '.download-'));

    try {
      const file = join(staging, archive);
      const [digest] = await download(`${RELEASE_URL}/${encodeURIComponent(archive)}`, file, ['sha256']);
      if (digest.toString('hex') !== (await publishedChecksum(archive))) {
        throw new Error(`Checksum mismatch for ${archive}`);
      }

      await extract({ file, cwd: staging, preserveOwner: false });

      // a parallel install of the same build may have finished first
      if (!this.isInstalled()) {
        await rm(this.extractPath, { recursive: true, force: true });
        await rename(join(staging, 'python'), this.extractPath);
      }
    } finally {
      await rm(staging, { recursive: true, force: true });
    }

    if (platform() === 'linux' && existsSync('/etc/NIXOS')) {
      useNixLoader(this.executablePath);
    }
  }

  public async uninstall(): Promise<void> {
    await rm(this.extractPath, { recursive: true, force: true });
  }
}

function buildTarget(): string {
  const system = platform() === 'linux' && isMusl() ? 'unknown-linux-musl' : SYSTEMS[platform()];
  return `${CPUS[arch()]}-${system}`;
}

async function publishedChecksum(archive: string): Promise<string | undefined> {
  const sums = await fetchText(`${RELEASE_URL}/SHA256SUMS`);
  return sums
    .split('\n')
    .find((line) => line.endsWith(`  ${archive}`))
    ?.split(' ')[0];
}

function useNixLoader(executable: string): void {
  // NixOS keeps the glibc loader in the store, not at the path the build expects
  const glibc = execSync('nix --extra-experimental-features "nix-command flakes" path-info nixpkgs#glibc.out').toString().trim();
  const loader = join(glibc, 'lib', arch() === 'arm64' ? 'ld-linux-aarch64.so.1' : 'ld-linux-x86-64.so.2');
  execSync(`nix-shell -p patchelf --run 'patchelf --set-interpreter ${loader} ${realpathSync(executable)}'`);
}
