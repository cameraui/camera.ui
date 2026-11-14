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

const NATIVE_READ_TIMEOUT_MS = 5 * 60 * 1000;

export function useFileDownload() {
  return { download };
}

export async function download(options: DownloadOptions): Promise<void> {
  options = { ...options, filename: sanitizeFilename(options.filename) };

  if (isCapacitor) {
    await downloadViaCapacitor(options);
    return;
  }

  if (!('url' in options)) {
    await saveBlob(await inMemoryBlob(options), options.filename);
    return;
  }

  const url = buildAbsoluteUrl(options.url);
  if (isTokenDownloadUrl(url) && (!isStandalone() || isChromium())) {
    await assertDownloadAvailable(url);
    clickLink(url, options.filename);
    return;
  }

  const blob = await tracked(options.filename, (transfer) => fetchBlob(url, transfer));
  if (blob) await saveBlob(blob, options.filename);
}

async function saveBlob(blob: Blob, filename: string): Promise<void> {
  if (isStandalone() && (await tryWebShare(blob, filename))) return;
  downloadViaAnchor(blob, filename);
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

async function inMemoryBlob(options: DownloadFromBlob | DownloadFromDataUrl): Promise<Blob> {
  if ('blob' in options) return options.blob;
  return (await fetch(options.dataUrl)).blob();
}

async function tracked<T>(filename: string, load: (transfer: DownloadTransfer) => Promise<T>): Promise<T | undefined> {
  const transfer = trackDownload(filename);
  try {
    return await load(transfer);
  } catch (err) {
    if (transfer.signal.aborted) return undefined;
    throw err;
  } finally {
    transfer.end();
  }
}

async function fetchBlob(url: string, transfer: DownloadTransfer): Promise<Blob> {
  const response = await fetchDownload(url, transfer.signal);
  const body = countedBody(response, transfer);
  return (body ? new Response(body, { headers: response.headers }) : response).blob();
}

async function fetchDownload(url: string, signal: AbortSignal): Promise<Response> {
  const response = await fetch(url, {
    headers: await fetchAuthHeaders(),
    credentials: 'include',
    signal,
  });
  assertOk(response);
  return response;
}

function countedBody(response: Response, transfer: DownloadTransfer): ReadableStream<Uint8Array> | null {
  if (!response.body) return null;
  const total = Number(response.headers.get('content-length')) || undefined;
  let loaded = 0;
  return response.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        loaded += chunk.byteLength;
        transfer.progress(loaded, total);
        controller.enqueue(chunk);
      },
    }),
  );
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
  const [{ Capacitor }, { Filesystem, Directory }, { Share }, { downloadPath, holdDownload, sweepDownloads, writeBlobToCache }] = await Promise.all([
    import('@capacitor/core'),
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
    import('@/utils/cacheFile.js'),
  ]);

  const path = downloadPath(options.filename);
  const release = holdDownload(path);
  let sharing = false;

  try {
    await sweepDownloads();
    let writtenUri: string | undefined;
    if ('url' in options) {
      const url = buildAbsoluteUrl(options.url);
      writtenUri = await tracked(options.filename, (transfer) => loadIntoCache(url, path, transfer));
    } else {
      writtenUri = await writeBlobToCache(await inMemoryBlob(options), path);
    }
    if (!writtenUri) return;

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

async function loadIntoCache(url: string, path: string, transfer: DownloadTransfer): Promise<string> {
  if (isPublicFqdnUrl(url) && !isPinnedUrl(url)) return transferNatively(url, path, transfer);

  const { writeBlobToCache, writeStreamToCache } = await import('@/utils/cacheFile.js');
  const response = await fetchDownload(url, transfer.signal);
  const body = countedBody(response, transfer);
  return body ? writeStreamToCache(body, path) : writeBlobToCache(await response.blob(), path);
}

async function transferNatively(url: string, path: string, transfer: DownloadTransfer): Promise<string> {
  const [{ CapacitorHttp }, { Filesystem, Directory }, { FileTransfer }, { DOWNLOAD_DIR }] = await Promise.all([
    import('@capacitor/core'),
    import('@capacitor/filesystem'),
    import('@capacitor/file-transfer'),
    import('@/utils/cacheFile.js'),
  ]);

  await Filesystem.mkdir({ path: DOWNLOAD_DIR, directory: Directory.Cache, recursive: true }).catch(() => {});
  const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
  const headers = await fetchAuthHeaders();
  const progress = await FileTransfer.addListener('progress', (status) => {
    if (status.url === url) transfer.progress(status.bytes, status.lengthComputable ? status.contentLength : undefined);
  });

  try {
    if (transfer.signal.aborted) throw transfer.signal.reason;
    const native = FileTransfer.downloadFile({ url, path: uri, headers, readTimeout: NATIVE_READ_TIMEOUT_MS, progress: true });
    const cancelled = new Promise<never>((_, reject) => {
      transfer.signal.addEventListener(
        'abort',
        () => {
          CapacitorHttp.request({ url, method: 'DELETE' }).catch(() => {});
          native.catch(() => {}).then(() => Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => {}));
          reject(transfer.signal.reason);
        },
        { once: true },
      );
    });
    await Promise.race([native, cancelled]);
    return uri;
  } finally {
    progress.remove();
  }
}

function ignoreShareCancel(err: unknown): void {
  if (!(err instanceof Error && err.message === 'Share canceled')) throw err;
}
