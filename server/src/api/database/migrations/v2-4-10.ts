import { notificationBucket } from '../../../manager/types.js';

import type { DBNotificationEntry } from '../types.js';
import type { Migration } from './types.js';

const migration: Migration = {
  version: '2.4.10',
  description: 'notifications are stored once with their recipients instead of once per user',
  async up(ctx) {
    const { notificationHistoryDB, notificationEntriesDB } = ctx.db;
    const entries = new Map<string, DBNotificationEntry>();

    for (const { value } of notificationHistoryDB.getRange()) {
      for (const { seenAt, ...item } of value.items) {
        const entry = entries.get(item.id) ?? { ...item, bucket: notificationBucket(item), recipients: [], seenBy: {} };
        entry.recipients.push(value._id);
        if (seenAt != null) entry.seenBy[value._id] = seenAt;
        entries.set(item.id, entry);
      }
    }

    await notificationEntriesDB.transaction(() => {
      for (const entry of entries.values()) notificationEntriesDB.put(entry.id, entry);
    });
    await notificationHistoryDB.clearAsync();

    ctx.logger.log(`Notifications: moved ${entries.size} entries to the shared list`);
  },
};

export default migration;
