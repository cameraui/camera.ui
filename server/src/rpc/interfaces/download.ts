import type { CreateDownloadOptions as PluginDownloadOptions, CreatePipeDownloadOptions as PluginPipeDownloadOptions, DownloadToken } from '@camera.ui/sdk';

export interface CreateDownloadOptions extends PluginDownloadOptions {
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

export interface CreateStreamDownloadOptions extends CreateDownloadOptions {
  markerPath: string;
}

export interface CreatePipeDownloadOptions extends PluginPipeDownloadOptions {
  pluginId: string;
  pipeId: string;
}

export interface PipeFailure {
  error: string;
}

// 'waiting': the plugin has handed over what it had and waits for the next pull
export type PipeState = 'gone' | 'writing' | 'waiting';

export interface PluginPipeInterface {
  pullPipe(pipeId: string): AsyncGenerator<Uint8Array | PipeFailure>;
  pipeState(pipeId: string): Promise<PipeState>;
}

export interface DownloadManagerInterface {
  createDownload(options: CreateDownloadOptions): Promise<DownloadToken>;
  createStreamDownload(options: CreateStreamDownloadOptions): Promise<DownloadToken>;
  createPipeDownload(options: CreatePipeDownloadOptions): Promise<DownloadToken>;
  deleteDownload(token: string): Promise<void>;
}
