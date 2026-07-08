import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { CoalescingWriter } from './coalescingWriter.js';
import { remapLegacyLayout } from './layout.js';
import { migrateLmdbToStoreFile } from './migrate.js';
import { backupStoreFile, readStoreFile, removeOrphanedTmpFiles, writeStoreFile } from './storeFile.js';

export const STORE_FILE_NAME = 'store.cui';

export class PluginStoreFile {
  private readonly path: string;
  private readonly writer: CoalescingWriter;
  private payload: Record<string, any> = {};
  private closed = true;

  constructor(
    private readonly volumeDir: string,
    private readonly pluginId: string,
  ) {
    this.path = join(volumeDir, STORE_FILE_NAME);
    this.writer = new CoalescingWriter((snapshot) => writeStoreFile(this.path, snapshot));
  }

  public async open(): Promise<void> {
    await mkdir(this.volumeDir, { recursive: true });
    await removeOrphanedTmpFiles(this.path);

    let payload = await readStoreFile(this.path);
    if (payload === undefined) {
      const migrated = await migrateLmdbToStoreFile(this.volumeDir, this.path);
      payload = migrated ? await readStoreFile(this.path) : undefined;
      if (payload === undefined) {
        payload = {};
        await writeStoreFile(this.path, payload);
      }
    }

    const remapped = remapLegacyLayout(payload, this.pluginId);
    if (remapped !== payload) {
      await writeStoreFile(this.path, remapped);
    }

    this.payload = remapped;
    await backupStoreFile(this.path);
    this.closed = false;
  }

  public get(): Record<string, any> {
    return this.payload;
  }

  public async put(payload: Record<string, any>): Promise<void> {
    if (this.closed) {
      // A silently "successful" no-op here would lose the write during
      // shutdown windows. Fail loudly instead.
      throw new Error(`store: put on closed store ${this.path}`);
    }
    this.payload = payload;
    await this.writer.write(payload);
  }

  public async close(): Promise<void> {
    this.closed = true;
    await this.writer.idle();
  }
}
