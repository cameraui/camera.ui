import AdmZip from 'adm-zip';
import { pathExists, remove } from 'fs-extra/esm';
import { dirname, join } from 'node:path';

export async function checkBundledPlugin(packageDir: string): Promise<string | undefined> {
  const bundleRootPath = join(packageDir, 'bundle.zip');
  const bundlePath = join(packageDir, 'bundle', 'bundle.zip');

  if (await pathExists(bundleRootPath)) {
    return bundleRootPath;
  }

  if (await pathExists(bundlePath)) {
    return bundlePath;
  }
}

export async function extractBundledPlugin(packageDir: string, bundlePath?: string): Promise<void> {
  bundlePath = bundlePath ?? (await checkBundledPlugin(packageDir));
  if (!bundlePath) {
    return;
  }

  const bundleDir = dirname(bundlePath);
  const zip = new AdmZip(bundlePath);
  zip.extractAllTo(bundleDir, true);

  await remove(bundlePath);
}
