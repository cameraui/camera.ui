import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { extract } from 'tar';
import { EnvHttpProxyAgent, ProxyAgent, fetch } from 'undici';

import { resolveNpmOptions } from './auth.js';

import type { ReadEntry } from 'tar';
import type { Dispatcher } from 'undici';

const CORGI_ACCEPT = 'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*';
const FULL_ACCEPT = 'application/json';
const REQUEST_TIMEOUT_MS = 5 * 60 * 1000;
const RETRIES = 2;
const RETRY_DELAY_MS = 500;

export interface PackageDist {
  tarball: string;
  integrity?: string;
  shasum?: string;
}

export interface PackageManifest {
  name: string;
  version: string;
  dist: PackageDist;
  bin?: string | Record<string, string>;
  engines?: Record<string, string>;
  os?: string[];
  cpu?: string[];
  deprecated?: string;
  displayName?: string;
  cameraui?: { protocolLevel?: number };
  [key: string]: unknown;
}

export interface Packument {
  name: string;
  'dist-tags': Record<string, string>;
  versions: Record<string, PackageManifest>;
  time?: Record<string, string> & { modified?: string };
  description?: string;
  homepage?: string;
  keywords?: string[];
  license?: string;
  maintainers?: { name?: string; email?: string }[];
  repository?: { url?: string };
  bugs?: { url?: string };
  displayName?: string;
  [key: string]: unknown;
}

export interface SearchObject {
  name: string;
  version: string;
  description?: string;
  keywords?: string[];
  links?: Record<string, string>;
  author?: { name?: string };
  publisher?: { username?: string };
  date?: string;
}

export interface RegistryError extends Error {
  code?: string;
  statusCode?: number;
}

let dispatcher: Dispatcher | undefined;

export async function fetchPackument(name: string, full: boolean): Promise<Packument> {
  const url = packumentUrl(name);

  try {
    return await fetchJson<Packument>(url, full ? FULL_ACCEPT : CORGI_ACCEPT);
  } catch (error) {
    // not every registry serves the abbreviated document
    if (!full && (error as RegistryError).code === 'E404') {
      return fetchJson<Packument>(url, FULL_ACCEPT);
    }
    throw error;
  }
}

export function resolveManifest(packument: Packument, spec: string, wanted: string): PackageManifest {
  const tagged = packument['dist-tags']?.[wanted];
  const version = tagged ?? wanted;
  const manifest = packument.versions?.[version];

  if (!manifest) {
    throw registryError(`No matching version found for ${spec}`, 'ETARGET');
  }

  return { ...manifest, _resolved: manifest.dist?.tarball, _integrity: manifest.dist?.integrity };
}

export async function searchRegistry(query: string, size: number): Promise<SearchObject[]> {
  const registry = registryFor();
  const url = `${trimSlashes(registry)}/-/v1/search?text=${encodeURIComponent(query)}&size=${size}`;
  const result = await fetchJson<{ objects?: { package: SearchObject }[] }>(url, FULL_ACCEPT);

  return (result.objects ?? []).map((entry) => entry.package);
}

export async function extractTarball(manifest: PackageManifest, dest: string): Promise<void> {
  const staging = await mkdtemp(join(tmpdir(), 'camera.ui-pkg-'));
  const tarball = join(staging, 'package.tgz');

  try {
    const digest = await download(manifest.dist.tarball, tarball);
    verifyIntegrity(manifest, digest);

    await emptyDir(dest);
    await extract({
      file: tarball,
      cwd: dest,
      strip: 1,
      noChmod: true,
      noMtime: true,
      preserveOwner: false,
      filter: (_path, stat) => {
        const entry = stat as ReadEntry;
        if (entry.type.endsWith('Link')) {
          return false;
        }
        entry.mode = entryMode(manifest, entry.path, entry.mode ?? 0, entry.type);
        return entry.type.endsWith('File');
      },
    });
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

export function registryFor(name?: string): string {
  const options = resolveNpmOptions();
  const scope = name?.startsWith('@') ? name.slice(0, name.indexOf('/')) : '';
  const scoped = scope ? options[`${scope}:registry`] : '';

  return scoped || options.registry || 'https://registry.npmjs.org/';
}

export function authHeaders(url: string): Record<string, string> {
  const options = resolveNpmOptions();

  for (const key of nerfDarts(url)) {
    const token = options[`${key}:_authToken`];
    if (token) {
      return { authorization: `Bearer ${token}` };
    }

    const auth = options[`${key}:_auth`];
    if (auth) {
      return { authorization: `Basic ${auth}` };
    }

    const username = options[`${key}:username`];
    const password = options[`${key}:_password`];
    if (username && password) {
      const decoded = Buffer.from(password, 'base64').toString('utf8');
      return { authorization: `Basic ${Buffer.from(`${username}:${decoded}`).toString('base64')}` };
    }
  }

  return {};
}

function packumentUrl(name: string): string {
  const escaped = name.startsWith('@') ? name.replace('/', '%2f') : name;
  return `${trimSlashes(registryFor(name))}/${escaped}`;
}

function trimSlashes(url: string): string {
  return url.replace(/\/+$/, '');
}

function nerfDarts(url: string): string[] {
  const parsed = new URL(url);
  const segments = parsed.pathname.split('/').filter(Boolean);
  const darts: string[] = [];

  for (let depth = segments.length; depth >= 0; depth--) {
    darts.push(`//${parsed.host}/${segments.slice(0, depth).join('/')}${depth > 0 ? '/' : ''}`.replace(/\/+$/, '/'));
  }

  return [...new Set(darts)];
}

function requestDispatcher(): Dispatcher {
  if (dispatcher) {
    return dispatcher;
  }

  const options = resolveNpmOptions();
  const proxy = options['https-proxy'] || options.proxy;

  dispatcher = proxy ? new ProxyAgent({ uri: proxy, connectTimeout: 30_000 }) : new EnvHttpProxyAgent({ connectTimeout: 30_000 });
  return dispatcher;
}

async function fetchJson<T>(url: string, accept: string): Promise<T> {
  const response = await request(url, accept);
  return (await response.json()) as T;
}

async function request(url: string, accept: string): Promise<Response> {
  let lastError: RegistryError | undefined;

  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * attempt));
    }

    try {
      const response = (await fetch(url, {
        headers: { accept, 'user-agent': userAgent(), ...authHeaders(url) },
        dispatcher: requestDispatcher(),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        redirect: 'follow',
      })) as unknown as Response;

      if (response.ok) {
        return response;
      }

      lastError = httpError(url, response.status);

      // npm-registry-fetch retries 408, 429 and 5xx only, the rest stays failed
      if (response.status < 500 && response.status !== 429 && response.status !== 408) {
        break;
      }
    } catch (error) {
      lastError = error as RegistryError;
    }
  }

  throw lastError ?? registryError(`Request failed: ${url}`, 'EUNKNOWN');
}

async function download(url: string, dest: string): Promise<string> {
  const response = await request(url, '*/*');
  if (!response.body) {
    throw registryError(`Empty response for ${url}`, 'EEMPTYBODY');
  }

  const hash = createHash('sha512');
  const sha1 = createHash('sha1');
  const body = Readable.fromWeb(response.body as never);

  body.on('data', (chunk: Buffer) => {
    hash.update(chunk);
    sha1.update(chunk);
  });

  await pipeline(body, createWriteStream(dest));

  return `sha512-${hash.digest('base64')}|sha1-${sha1.digest('hex')}`;
}

function verifyIntegrity(manifest: PackageManifest, digest: string): void {
  const [sha512, sha1] = digest.split('|');
  const expected = manifest.dist.integrity;

  if (expected) {
    const matches = expected
      .split(/\s+/)
      .filter(Boolean)
      .some((entry) => entry === sha512);

    if (!matches) {
      throw registryError(`Integrity check failed for ${manifest.name}@${manifest.version}: expected ${expected}, got ${sha512}`, 'EINTEGRITY');
    }
    return;
  }

  if (manifest.dist.shasum) {
    const actual = sha1.replace('sha1-', '');
    if (actual !== manifest.dist.shasum) {
      throw registryError(`Integrity check failed for ${manifest.name}@${manifest.version}: expected ${manifest.dist.shasum}, got ${actual}`, 'EINTEGRITY');
    }
    return;
  }

  throw registryError(`No integrity published for ${manifest.name}@${manifest.version}`, 'EINTEGRITY');
}

function entryMode(manifest: PackageManifest, path: string, mode: number, type: string): number {
  const floor = /Directory|GNUDumpDir/.test(type) ? 0o777 : type.endsWith('File') ? 0o666 : 0;
  const executable = isPackageBin(manifest, path) ? 0o111 : 0;

  return mode | floor | executable | 0o600;
}

function isPackageBin(manifest: PackageManifest, path: string): boolean {
  if (!manifest.bin) {
    return false;
  }

  const bins = typeof manifest.bin === 'string' ? { [manifest.name]: manifest.bin } : manifest.bin;
  const relative = path.replace(/^[^\\/]*\//, '');

  return Object.values(bins).includes(relative);
}

async function emptyDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });

  const entries = await readdir(dir);
  await Promise.all(entries.map((entry) => rm(join(dir, entry), { recursive: true, force: true })));
}

function userAgent(): string {
  return `camera.ui/${process.env.npm_package_version ?? 'server'} node/${process.version}`;
}

function httpError(url: string, status: number): RegistryError {
  const code = status === 404 ? 'E404' : `E${status}`;
  const error = registryError(`${status} ${statusText(status)} - GET ${url}`, code);
  error.statusCode = status;
  return error;
}

function statusText(status: number): string {
  if (status === 404) {
    return 'Not Found';
  }
  if (status === 401) {
    return 'Unauthorized';
  }
  if (status === 403) {
    return 'Forbidden';
  }
  return 'Error';
}

function registryError(message: string, code: string): RegistryError {
  const error = new Error(message) as RegistryError;
  error.code = code;
  return error;
}

export function resetDispatcher(): void {
  dispatcher = undefined;
}
