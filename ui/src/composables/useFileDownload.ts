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

  const blob = await resolveBlobForWeb(options);

  if (isStandalone() && (await tryWebShare(blob, options.filename))) {
    return;
  }

  downloadViaAnchor(blob, options.filename);
}

function sanitizeFilename(filename: string): string {
  return filename.replace(/[\\/:*?"<>|]/g, '_');
}

function buildAbsoluteUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  const target = getConnection().target.value;
  const origin = target?.endpoint.url ?? window.location.origin;
  return `${origin}${url.startsWith('/') ? '' : '/'}${url}`;
}

function buildAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const tokens = getConnection().target.value?.tokens;
  if (tokens?.access) {
    headers.Authorization = `Bearer ${tokens.access}`;
  }
  if (tokens?.proxySession) {
    headers['X-Proxy-Session'] = tokens.proxySession;
  }
  return headers;
}

async function resolveBlobForWeb(options: DownloadOptions): Promise<Blob> {
  if ('blob' in options) {
    return options.blob;
  }

  if ('dataUrl' in options) {
    const response = await fetch(options.dataUrl);
    return response.blob();
  }

  // Cross-origin server URL on PWA / browser. Use bare fetch with the same
  // auth headers axios would attach — keeps streaming chunked responses
  // working without going through axios's transformation pipeline.
  const response = await fetch(buildAbsoluteUrl(options.url), {
    headers: buildAuthHeaders(),
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }
  return response.blob();
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  // iOS Safari predates display-mode and exposes this legacy flag instead.
  return Boolean((window.navigator as { standalone?: boolean }).standalone);
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
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Defer revoke so Safari has time to start the download before the URL dies.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function downloadViaCapacitor(options: DownloadOptions): Promise<void> {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);

  let writtenUri: string;

  if ('url' in options) {
    const { FileTransfer } = await import('@capacitor/file-transfer');
    const fullPath = await Filesystem.getUri({ path: options.filename, directory: Directory.Cache });
    await FileTransfer.downloadFile({
      url: buildAbsoluteUrl(options.url),
      path: fullPath.uri,
      headers: buildAuthHeaders(),
      readTimeout: 5 * 60 * 1000,
    });
    writtenUri = fullPath.uri;
  } else {
    const blob = 'blob' in options ? options.blob : await (await fetch(options.dataUrl)).blob();
    const base64 = await blobToBase64(blob);
    const written = await Filesystem.writeFile({
      path: options.filename,
      data: base64,
      directory: Directory.Cache,
    });
    writtenUri = written.uri;
  }

  await Share.share({
    title: options.filename,
    url: writtenUri,
  });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}
