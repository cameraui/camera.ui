import { notificationBucket } from '../../../manager/types.js';

import type { DBNotificationEntry } from '../types.js';
import type { Migration } from './types.js';

const migration: Migration = {
  version: '2.4.10',
  description:
    'notifications are stored once with their recipients instead of once per user, the RTMP server is off until it is switched on, user records drop a form field',
  async up(ctx) {
    const { notificationHistoryDB, notificationEntriesDB, usersDB } = ctx.db;
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

    if (ctx.configService.go2rtcConfig.rtmp.listen) {
      await ctx.configService.writeGo2RtcConfigFile({ rtmp: { listen: '' } });
      ctx.logger.log('RTMP: the server is off now, Settings, Streaming switches it on again');
    }

    await usersDB.transaction(() => {
      for (const { key, value } of usersDB.getRange()) {
        if (!('passwordConfirm' in value)) continue;
        delete value.passwordConfirm;
        usersDB.put(key, value);
      }
    });
  },
};

export default migration;
