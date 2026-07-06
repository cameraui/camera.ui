import { container } from 'tsyringe';

import type { Database } from '../database/index.js';
import type { DBDownloadEntry } from '../database/types.js';

export class DownloadsService {
  private dbs: Database;

  constructor() {
    this.dbs = container.resolve<Database>('dbs');
  }

  public list(): DBDownloadEntry[] {
    return [...this.dbs.downloadsDB.getRange()].map(({ value }) => value);
  }

  public get(token: string): DBDownloadEntry | undefined {
    return this.dbs.downloadsDB.get(token);
  }

  public async put(entry: DBDownloadEntry): Promise<void> {
    await this.dbs.downloadsDB.put(entry._id, entry);
  }

  public async remove(token: string): Promise<void> {
    await this.dbs.downloadsDB.remove(token);
  }
}
