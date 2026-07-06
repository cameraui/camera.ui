import type { ConfigService } from '../../../services/config/index.js';
import type { LoggerService } from '../../../services/logger/index.js';
import type { Database } from '../index.js';

export interface MigrationContext {
  db: Database;
  logger: LoggerService;
  configService: ConfigService;
}

export interface Migration {
  readonly version: string;
  readonly description: string;
  up(ctx: MigrationContext): Promise<void>;
}
