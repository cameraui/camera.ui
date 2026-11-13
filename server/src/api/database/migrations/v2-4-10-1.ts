import type { Migration } from './types.js';

const migration: Migration = {
  version: '2.4.10-1',
  description: 'user records drop a form field',
  async up(ctx) {
    const { usersDB } = ctx.db;

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
