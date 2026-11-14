import { isPublicFqdnUrl } from '@camera.ui/transport/transports/nativeHttp';

import { isPinnedUrl } from '@/connection/certTrust.js';
import { fetchAuthHeaders } from '@/connection/fetchAuth.js';
import { getConnection } from '@/connection/instance.js';
import { isCapacitor } from '@/connection/runtime.js';

interface DownloadFromBlob {
  blob: Blob;
  filename: string;
  mimeType?: string;
}

interface DownloadFromUrl {
  url: string;
  filename: string;
  mimeType?: string;
}

interface DownloadFromDataUrl {
  dataUrl: string;
  filename: string;
  mimeType?: string;
}

export type DownloadOptions = DownloadFromBlob | DownloadFromUrl | DownloadFromDataUrl;

export function useFileDownload() {
  return { download };
}

export async function download(options: DownloadOptions): Promise<void> {
  options = { ...options, filename: sanitizeFilename(options.filename) };

  if (isCapacitor) {
    await downloadViaCapacitor(options);
    return;
  }

  const standalone = isStandalone();
  const url = 'url' in options ? buildAbsoluteUrl(options.url) : null;
  if (url && isTokenDownloadUrl(url) && (!standalone || isChromium())) {
    await assertDownloadAvailable(url);
    clickLink(url, options.filename);
    return;
  }

  const blob = await resolveBlobForWeb(options);

  if (standalone && (await tryWebShare(blob, options.filename))) {
    return;
  }

  downloadViaAnchor(blob, options.filename);
}

function sanitizeFilename(filename: string): string {
  return filename.replace(/[\\/:*?"<>|]/g, '_');
}

function isTokenDownloadUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.origin === window.location.origin && /\/api\/download\/[^/]+$/.test(parsed.pathname);
  } catch {
    return false;
  }
}

async function assertDownloadAvailable(url: string): Promise<void> {
  assertOk(await fetch(url, { method: 'HEAD', cache: 'no-store' }));
}

function buildAbsoluteUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  const target = getConnection().target.value;
  const origin = target?.endpoint.url ?? window.location.origin;
  return `${origin}${url.startsWith('/') ? '' : '/'}${url}`;
}

async function resolveBlobForWeb(options: DownloadOptions): Promise<Blob> {
  if ('blob' in options) {
    return options.blob;
  }

  if ('dataUrl' in options) {
    const response = await fetch(options.dataUrl);
    return response.blob();
  }

  const response = await fetchDownload(buildAbsoluteUrl(options.url));
  return response.blob();
}

async function fetchDownload(url: string): Promise<Response> {
  const response = await fetch(url, {
    headers: await fetchAuthHeaders(),
    credentials: 'include',
  });
  assertOk(response);
  return response;
}

function assertOk(response: Response): void {
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  // iOS Safari predates display-mode and exposes this legacy flag instead
  return Boolean((window.navigator as { standalone?: boolean }).standalone);
}

// only Chromium has userAgentData, and its installed web apps save a download like a tab does
function isChromium(): boolean {
  return 'userAgentData' in window.navigator;
}

async function tryWebShare(blob: Blob, filename: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.canShare || !navigator.share) {
    return false;
  }

  const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
  if (!navigator.canShare({ files: [file] })) {
    return false;
  }

  try {
    await navigator.share({ files: [file] });
    return true;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return true;
    }
    return false;
  }
}

function downloadViaAnchor(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  clickLink(url, filename);
  // safari needs a moment to start the download before the url is revoked
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function clickLink(href: string, filename: string): void {
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function downloadViaCapacitor(options: DownloadOptions): Promise<void> {
  const [{ Capacitor }, { Filesystem, Directory }, { Share }, { DOWNLOAD_DIR, downloadPath, holdDownload, sweepDownloads, writeBlobToCache, writeStreamToCache }] =
    await Promise.all([import('@capacitor/core'), import('@capacitor/filesystem'), import('@capacitor/share'), import('@/utils/cacheFile.js')]);

  const path = downloadPath(options.filename);
  const url = 'url' in options ? buildAbsoluteUrl(options.url) : null;
  const release = holdDownload(path);
  let sharing = false;

  try {
    await sweepDownloads();
    let writtenUri: string;

    // FileTransfer only knows the system trust store, LAN and pinned hosts load in the webview
    if (url && isPublicFqdnUrl(url) && !isPinnedUrl(url)) {
      const { FileTransfer } = await import('@capacitor/file-transfer');
      await Filesystem.mkdir({ path: DOWNLOAD_DIR, directory: Directory.Cache, recursive: true }).catch(() => {});
      const fullPath = await Filesystem.getUri({ path, directory: Directory.Cache });
      await FileTransfer.downloadFile({
        url,
        path: fullPath.uri,
        headers: await fetchAuthHeaders(),
        readTimeout: 5 * 60 * 1000,
      });
      writtenUri = fullPath.uri;
    } else if (url) {
      const response = await fetchDownload(url);
      writtenUri = response.body ? await writeStreamToCache(response.body, path) : await writeBlobToCache(await response.blob(), path);
    } else {
      writtenUri = await writeBlobToCache(await resolveBlobForWeb(options), path);
    }

    sharing = true;
    await Share.share({
      title: options.filename,
      url: writtenUri,
    }).catch(ignoreShareCancel);
  } finally {
    // android receivers may read the file after the chooser closes, even on a reported cancel, a later sweep removes it
    if (!sharing || Capacitor.getPlatform() !== 'android') {
      await Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => {});
    }
    release();
  }
}

function ignoreShareCancel(err: unknown): void {
  if (!(err instanceof Error && err.message === 'Share canceled')) throw err;
}
