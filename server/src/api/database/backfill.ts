import type { Database as DB } from 'lmdb';
import type * as zod from 'zod';
import type { LoggerService } from '../../services/logger/index.js';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date) && !Buffer.isBuffer(value);
}

function getAtPath(root: unknown, path: PropertyKey[]): unknown {
  let current: unknown = root;
  for (const segment of path) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<PropertyKey, unknown>)[segment];
  }
  return current;
}

function parseTolerant(schema: zod.ZodType, value: Record<string, unknown>): Record<string, unknown> | undefined {
  const candidate = structuredClone(value);

  for (let attempt = 0; attempt < 5; attempt++) {
    const result = schema.safeParse(candidate);
    if (result.success) {
      return isPlainObject(result.data) ? result.data : undefined;
    }

    const unrecognized = result.error.issues.filter((issue) => issue.code === 'unrecognized_keys');
    if (unrecognized.length !== result.error.issues.length) return undefined;

    for (const issue of unrecognized) {
      const target = getAtPath(candidate, issue.path);
      if (!isPlainObject(target)) return undefined;
      for (const key of issue.keys) delete target[key];
    }
  }

  return undefined;
}

function fillMissing(target: Record<string, unknown>, parsed: Record<string, unknown>): boolean {
  let changed = false;
  for (const [key, parsedValue] of Object.entries(parsed)) {
    const current = target[key];
    if (current === undefined) {
      if (parsedValue !== undefined) {
        target[key] = parsedValue;
        changed = true;
      }
    } else if (isPlainObject(current) && isPlainObject(parsedValue)) {
      if (fillMissing(current, parsedValue)) changed = true;
    }
  }
  return changed;
}

export async function backfillDefaults(db: DB, schema: zod.ZodType, logger: LoggerService, label: string): Promise<void> {
  let filled = 0;
  let skipped = 0;

  await db.transaction(() => {
    for (const { key, value } of db.getRange()) {
      if (!isPlainObject(value)) continue;

      const parsed = parseTolerant(schema, value);
      if (!parsed) {
        skipped++;
        continue;
      }

      if (fillMissing(value, parsed)) {
        db.put(key, value);
        filled++;
      }
    }
  });

  if (filled > 0) {
    logger.debug(`Schema backfill (${label}): filled new default fields on ${filled} record(s)`);
  }
  if (skipped > 0) {
    logger.warn(`Schema backfill (${label}): ${skipped} record(s) did not match the schema and were left untouched`);
  }
}

export async function backfillSingletonDefaults(db: DB, key: string, schema: zod.ZodType, logger: LoggerService, label: string): Promise<void> {
  const value = db.get(key);
  if (!isPlainObject(value)) return;

  const parsed = parseTolerant(schema, value);
  if (!parsed) {
    logger.warn(`Schema backfill (${label}): record did not match the schema and was left untouched`);
    return;
  }

  if (fillMissing(value, parsed)) {
    await db.put(key, value);
    logger.debug(`Schema backfill (${label}): filled new default fields`);
  }
}
