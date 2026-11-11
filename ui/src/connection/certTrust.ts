import type { Endpoint } from '@camera.ui/transport';

export interface CertTrustRequest {
  readonly ca?: string;
  readonly leafSha256?: string;
  readonly hosts: readonly string[];
  readonly direct?: boolean;
}

export type CertTrustInstaller = (request: CertTrustRequest) => Promise<void> | void;

let installer: CertTrustInstaller | null = null;
let pinnedHosts: ReadonlySet<string> = new Set();

export function setCertTrustInstaller(fn: CertTrustInstaller | null): void {
  installer = fn;
  if (!fn) pinnedHosts = new Set();
}

export function hasCertTrustInstaller(): boolean {
  return installer !== null;
}

export function isPinnedUrl(url: string): boolean {
  if (pinnedHosts.size === 0) return false;
  const host = hostOf(url);
  return host !== null && pinnedHosts.has(host);
}

export async function trustInternalCa(ca: string | undefined, pool: readonly Endpoint[]): Promise<void> {
  if (!ca) return;
  const lanUrls = pool.filter((endpoint) => endpoint.mode === 'direct-lan').map((endpoint) => endpoint.url);
  await install({ ca, hosts: hostsOf(lanUrls) });
}

export async function trustDirectServer(server: { url: string; internalAddresses: readonly string[]; ca?: string; leafSha256?: string }): Promise<void> {
  if (!server.ca && !server.leafSha256) return;
  await install({ ca: server.ca, leafSha256: server.leafSha256, hosts: hostsOf([server.url, ...server.internalAddresses]), direct: true });
}

async function install(request: CertTrustRequest): Promise<void> {
  if (!installer || request.hosts.length === 0) return;

  try {
    await installer(request);
    pinnedHosts = new Set(request.hosts);
  } catch {
    // trust stays as it is, the race falls back to the external endpoints
  }
}

function hostsOf(urls: readonly string[]): string[] {
  return [...new Set(urls.map(hostOf).filter((host): host is string => Boolean(host)))];
}

function hostOf(url: string): string | null {
  try {
    const hostname = new URL(url).hostname;
    if (!hostname) return null;
    return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
  } catch {
    return null;
  }
}
