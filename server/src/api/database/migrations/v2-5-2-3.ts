import type { DBHomeBreakpoint, DBHomeProfile } from '../types.js';
import type { Migration } from './types.js';

interface SizedProfile extends DBHomeProfile {
  size?: DBHomeBreakpoint;
}

const migration: Migration = {
  version: '2.5.2-3',
  description: 'Home profiles leave the width to each page, the first one becomes the default',
  async up(ctx) {
    const { usersDB } = ctx.db;

    await usersDB.transaction(() => {
      for (const { key, value } of usersDB.getRange()) {
        const home = value.preferences?.home;
        const profiles: SizedProfile[] | undefined = home?.profiles;
        if (!home || !profiles?.some((profile) => profile.size)) continue;
        home.profiles = profiles.map(({ size, ...profile }) => ({
          ...profile,
          pages: profile.pages.map((page) => (size && page.widgets.some((widget) => widget.layout) ? { ...page, size } : page)),
        }));
        usersDB.put(key, value);
      }
    });
  },
};

export default migration;
