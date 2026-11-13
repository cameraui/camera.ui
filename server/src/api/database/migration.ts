import { inject } from '../../container.js';
import { Database } from './index.js';
import { loadMigrations } from './migrations/index.js';
import { compareDatabaseVersions } from './version.js';

import type { MigrationContext } from './migrations/types.js';

export class MigrationRunner {
  private ctx: MigrationContext;

  constructor(db: Database) {
    const logger = inject('logger');
    const configService = inject('configService');

    this.ctx = {
      db,
      logger,
      configService,
    };
  }

  public async migrate(): Promise<void> {
    const settingsDb = this.ctx.db.settingsDB.get('settings')!;

    const oldVersion = settingsDb.version;
    const newVersion = Database.VERSION;

    if (compareDatabaseVersions(oldVersion, newVersion) === 0) {
      this.ctx.logger.log('Database is up to date. Version:', newVersion);
      return;
    }

    if (compareDatabaseVersions(oldVersion, newVersion) > 0) {
      this.ctx.logger.log(`Database version ${oldVersion} is greater than the current version ${newVersion}, skipping migration.`);
      return;
    }

    this.ctx.logger.attention(`Database migration from ${oldVersion} to ${newVersion}`);

    const migrations = await loadMigrations();
    for (const migration of migrations) {
      if (compareDatabaseVersions(migration.version, oldVersion) > 0 && compareDatabaseVersions(migration.version, newVersion) <= 0) {
        this.ctx.logger.log(`Applying migration ${migration.version}: ${migration.description}`);
        await migration.up(this.ctx);
      }
    }

    settingsDb.version = newVersion;
    await this.ctx.db.settingsDB.put('settings', settingsDb);

    this.ctx.logger.log('Database migration completed');
  }
}
