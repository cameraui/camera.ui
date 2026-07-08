import { open } from 'lmdb';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { writeStoreFile } from './storeFile.js';

export async function migrateLmdbToStoreFile(volumeDir: string, storePath: string): Promise<boolean> {
  if (existsSync(storePath) || !existsSync(join(volumeDir, 'data.mdb'))) {
    return false;
  }

  const db = open(volumeDir, { name: 'plugins' });
  try {
    const config = db.get('config') as Record<string, any> | undefined;
    if (!config || Object.keys(config).length === 0) {
      return false;
    }

    await writeStoreFile(storePath, config);
    return true;
  } finally {
    await db.close();
  }
}
