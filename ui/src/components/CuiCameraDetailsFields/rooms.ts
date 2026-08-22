import type { DBRoomCatalog } from '@shared/types';

export interface RoomOption {
  label: string;
  value: string;
}

export interface RoomOptionGroup {
  label: string;
  items: RoomOption[];
}

export function buildRoomOptions(catalog: DBRoomCatalog | undefined, t: (key: string) => string): RoomOption[] | RoomOptionGroup[] {
  const rooms = catalog?.rooms ?? [];
  const levels = [...(catalog?.levels ?? [])].sort((a, b) => a.order - b.order);

  const option = (room: { id: string; name: string }): RoomOption => ({
    label: room.name === 'Default' ? t('components.form.label.room_default') : room.name,
    value: room.id,
  });

  if (!levels.length) return rooms.map(option).sort((a, b) => a.label.localeCompare(b.label));

  const groups: RoomOptionGroup[] = [];
  for (const level of levels) {
    const items = rooms.filter((room) => room.levelId === level.id).map(option);
    if (items.length) groups.push({ label: level.name, items });
  }

  const loose = rooms.filter((room) => !room.levelId).map(option);
  if (loose.length) groups.push({ label: t('components.form.label.room_no_level'), items: loose });

  return groups;
}
