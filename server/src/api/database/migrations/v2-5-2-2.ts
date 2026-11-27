import { randomUUID } from 'node:crypto';

import type { DBHomeBreakpoint, DBHomeDockKey, DBHomePage, DBHomeProfile, DBHomeWidget, DBHomeWidgetPosition } from '../types.js';
import type { Migration } from './types.js';

interface LegacyWidget extends Omit<DBHomeWidget, 'layout'> {
  layouts?: Partial<Record<DBHomeBreakpoint, DBHomeWidgetPosition>>;
}

interface SizedProfile extends DBHomeProfile {
  size: DBHomeBreakpoint;
}

interface LegacyDashboard {
  pages: (Omit<DBHomePage, 'widgets'> & { widgets: LegacyWidget[] })[];
  dock?: DBHomeDockKey[];
  rooms?: string[];
  hiddenRooms?: string[];
}

const SIZES: DBHomeBreakpoint[] = ['xl', 'lg', 'md', 'sm'];

const migration: Migration = {
  version: '2.5.2-2',
  description: 'Home dashboards become profiles, one for each width that had its own arrangement',
  async up(ctx) {
    const { usersDB } = ctx.db;

    await usersDB.transaction(() => {
      for (const { key, value } of usersDB.getRange()) {
        const home: { dashboard?: LegacyDashboard; profiles?: DBHomeProfile[] } | undefined = value.preferences?.home;
        if (!home?.dashboard) continue;
        home.profiles = toProfiles(home.dashboard);
        delete home.dashboard;
        usersDB.put(key, value);
      }
    });
  },
};

function toProfiles({ pages, dock, rooms, hiddenRooms }: LegacyDashboard): SizedProfile[] {
  const widgets = pages.flatMap((page) => page.widgets);
  const sizes = SIZES.filter((size) => widgets.some((widget) => widget.layouts?.[size]));
  if (!sizes.length && !pages.length && !dock && !rooms && !hiddenRooms) return [];
  return (sizes.length ? sizes : (['lg'] as const)).map((size) => ({
    id: randomUUID(),
    size,
    pages: pages.map((page) => ({
      ...page,
      widgets: page.widgets.map(({ layouts, ...widget }) => (layouts?.[size] ? { ...widget, layout: layouts[size] } : widget)),
    })),
    ...(dock && { dock }),
    ...(rooms && { rooms }),
    ...(hiddenRooms && { hiddenRooms }),
  }));
}

export default migration;
