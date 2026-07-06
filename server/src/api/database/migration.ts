import semver from 'semver';
import { container } from 'tsyringe';

import { Database } from './index.js';
import { loadMigrations } from './migrations/index.js';

import type { ConfigService } from '../../services/config/index.js';
import type { LoggerService } from '../../services/logger/index.js';
import type { MigrationContext } from './migrations/types.js';

export class MigrationRunner {
  private ctx: MigrationContext;

  constructor(db: Database) {
    const logger = container.resolve<LoggerService>('logger');
    const configService = container.resolve<ConfigService>('configService');

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

    if (semver.eq(oldVersion, newVersion)) {
      this.ctx.logger.log('Database is up to date. Version:', newVersion);
      return;
    }

    if (semver.gt(oldVersion, newVersion)) {
      this.ctx.logger.log(`Database version ${oldVersion} is greater than the current version ${newVersion}, skipping migration.`);
      return;
    }

    this.ctx.logger.attention(`Database migration from ${oldVersion} to ${newVersion}`);

    const migrations = await loadMigrations();
    for (const migration of migrations) {
      if (semver.gt(migration.version, oldVersion) && semver.lte(migration.version, newVersion)) {
        this.ctx.logger.log(`Applying migration ${migration.version}: ${migration.description}`);
        await migration.up(this.ctx);
      }
    }

    settingsDb.version = newVersion;
    await this.ctx.db.settingsDB.put('settings', settingsDb);

    this.ctx.logger.log('Database migration completed');
  }
}
