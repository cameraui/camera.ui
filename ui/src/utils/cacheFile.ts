import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';

export const CACHE_WRITE_CHUNK_BYTES = 4 * 1024 * 1024;
export const DOWNLOAD_DIR = 'downloads';
export const STALE_DOWNLOAD_MS = 60 * 60 * 1000;

const BASE64_PIECE_BYTES = 3 * 8192;

type Append = (bytes: Uint8Array) => Promise<void>;

const heldDownloads = new Set<string>();

export async function writeStreamToCache(body: ReadableStream<Uint8Array>, path: string, chunkBytes = CACHE_WRITE_CHUNK_BYTES): Promise<string> {
  const reader = body.getReader();
  try {
    return await writeInChunks(path, async (append) => {
      const chunk = new Uint8Array(chunkBytes);
      let filled = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        let offset = 0;
        while (offset < value.byteLength) {
          const take = Math.min(chunkBytes - filled, value.byteLength - offset);
          chunk.set(value.subarray(offset, offset + take), filled);
          filled += take;
          offset += take;
          if (filled === chunkBytes) {
            await append(chunk);
            filled = 0;
          }
        }
      }
      if (filled > 0) await append(chunk.subarray(0, filled));
    });
  } catch (err) {
    reader.cancel(err).catch(() => {});
    throw err;
  }
}

export async function writeBlobToCache(blob: Blob, path: string, chunkBytes = CACHE_WRITE_CHUNK_BYTES): Promise<string> {
  if (blob.size <= chunkBytes) {
    const data = bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
    const { uri } = await Filesystem.writeFile({ path, data, directory: Directory.Cache, recursive: true });
    return uri;
  }
  return writeInChunks(path, async (append) => {
    for (let offset = 0; offset < blob.size; offset += chunkBytes) {
      await append(new Uint8Array(await blob.slice(offset, offset + chunkBytes).arrayBuffer()));
    }
  });
}

export function downloadPath(filename: string): string {
  return `${DOWNLOAD_DIR}/${filename}`;
}

export async function clearDownloads(): Promise<void> {
  if (!(await downloadDirExists())) return;
  await Filesystem.rmdir({ path: DOWNLOAD_DIR, directory: Directory.Cache, recursive: true }).catch(() => {});
}

export function holdDownload(path: string): () => void {
  heldDownloads.add(path);
  return () => heldDownloads.delete(path);
}

export async function sweepDownloads(): Promise<void> {
  if (!(await downloadDirExists())) return;
  const listing = await Filesystem.readdir({ path: DOWNLOAD_DIR, directory: Directory.Cache }).catch(() => null);
  if (!listing) return;

  const cutoff = Date.now() - STALE_DOWNLOAD_MS;
  for (const file of listing.files) {
    const path = downloadPath(file.name);
    const stale = file.type === 'file' && file.mtime < cutoff;
    if (!stale || heldDownloads.has(path)) continue;
    await Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => {});
  }
}

export function bytesToBase64(bytes: Uint8Array): string {
  const native = (bytes as { toBase64?: () => string }).toBase64;
  if (typeof native === 'function') return native.call(bytes);
  let out = '';
  for (let i = 0; i < bytes.length; i += BASE64_PIECE_BYTES) {
    out += btoa(String.fromCharCode.apply(null, bytes.subarray(i, i + BASE64_PIECE_BYTES) as unknown as number[]));
  }
  return out;
}

async function writeInChunks(path: string, produce: (append: Append) => Promise<void>): Promise<string> {
  try {
    const { uri } = await Filesystem.writeFile({ path, data: '', directory: Directory.Cache, encoding: Encoding.UTF8, recursive: true });
    await produce(async (bytes) => {
      await Filesystem.appendFile({ path, data: bytesToBase64(bytes), directory: Directory.Cache });
    });
    return uri;
  } catch (err) {
    await Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => {});
    throw err;
  }
}

async function downloadDirExists(): Promise<boolean> {
  const listing = await Filesystem.readdir({ path: '', directory: Directory.Cache }).catch(() => null);
  return !listing || listing.files.some((file) => file.name === DOWNLOAD_DIR);
}
