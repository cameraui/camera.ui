export type DownloadCleanup = 'never' | 'on-expiry' | 'on-download';

export interface CreateDownloadOptions {
  filePath: string;
  filename?: string;
  mimeType?: string;
  ttlMs?: number;
  cleanup?: DownloadCleanup;
  remotePluginId?: string;
}

export interface FileServeStat {
  exists: boolean;
  size: number;
}

export interface PluginFileServeInterface {
  statFile(filePath: string): Promise<FileServeStat>;
  readFileChunk(filePath: string, offset: number, length: number): Promise<Uint8Array>;
  deleteFile(filePath: string): Promise<void>;
}

export interface DownloadToken {
  token: string;
  url: string;
  publicUrl: string;
  expiresAt: number;
}

export interface CreateStreamDownloadOptions extends CreateDownloadOptions {
  markerPath: string;
}

export interface DownloadManagerInterface {
  createDownload(options: CreateDownloadOptions): Promise<DownloadToken>;
  createStreamDownload(options: CreateStreamDownloadOptions): Promise<DownloadToken>;
  deleteDownload(token: string): Promise<void>;
}
