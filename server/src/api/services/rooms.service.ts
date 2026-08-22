import { randomUUID } from 'node:crypto';
import { container } from 'tsyringe';

import type { Database } from '../database/index.js';
import type { DBLevel, DBRoom, DBRoomCatalog } from '../database/types.js';
import type { CreateRoomInput } from '../schemas/rooms.schema.js';
import type { SocketService } from '../websocket/index.js';

const EMPTY_CATALOG: DBRoomCatalog = { version: 0, updatedAt: 0, levels: [], rooms: [] };

let labelCache: { version: number; labels: Map<string, string> } | undefined;

export class RoomsService {
  private dbs: Database;

  constructor() {
    this.dbs = container.resolve<Database>('dbs');
  }

  public get(): DBRoomCatalog {
    return this.dbs.roomsDB.get('rooms') ?? EMPTY_CATALOG;
  }

  public byId(roomId: string | null | undefined): DBRoom | undefined {
    if (!roomId) return undefined;
    return this.get().rooms.find((room) => room.id === roomId);
  }

  public byName(name: string): DBRoom | undefined {
    const wanted = name.trim().toLowerCase();
    return this.get().rooms.find((room) => room.name.toLowerCase() === wanted);
  }

  public labels(): Map<string, string> {
    const catalog = this.get();
    if (labelCache?.version === catalog.version) return labelCache.labels;

    const levels = new Map(catalog.levels.map((level) => [level.id, level.name]));
    const counts = new Map<string, number>();
    for (const room of catalog.rooms) {
      const key = room.name.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const labels = new Map<string, string>();
    for (const room of catalog.rooms) {
      const level = room.levelId ? levels.get(room.levelId) : undefined;
      const ambiguous = (counts.get(room.name.toLowerCase()) ?? 0) > 1;
      labels.set(room.id, ambiguous && level ? qualify(room.name, level) : room.name);
    }

    labelCache = { version: catalog.version, labels };

    return labels;
  }

  public label(roomId: string | null | undefined): string | undefined {
    if (!roomId) return undefined;
    return this.labels().get(roomId);
  }

  public async create(input: CreateRoomInput): Promise<DBRoom> {
    const existing = this.byName(input.name);
    if (existing) return existing;

    const catalog = this.get();
    const room: DBRoom = {
      id: randomUUID(),
      name: uniqueName(input.name, input.levelId, catalog.rooms),
      levelId: input.levelId,
      outdoor: input.outdoor,
      publicSpace: input.publicSpace,
      note: input.note,
    };

    await this.write((current) => {
      current.rooms.push(room);
    });

    return room;
  }

  public async resolveByName(name: string): Promise<DBRoom> {
    return this.byName(name) ?? (await this.create({ name, levelId: null, outdoor: false, publicSpace: false, note: '' }));
  }

  public async fallback(): Promise<DBRoom> {
    return this.resolveByName('Default');
  }

  public async apply(levels: DBLevel[], rooms: DBRoom[]): Promise<DBRoomCatalog> {
    const levelIds = new Set(levels.map((level) => level.id));
    const kept: DBRoom[] = [];

    for (const room of rooms) {
      const levelId = room.levelId && levelIds.has(room.levelId) ? room.levelId : null;
      kept.push({ ...room, levelId, name: uniqueName(room.name, levelId, kept) });
    }

    return this.write((current) => {
      current.levels = levels;
      current.rooms = kept;
    });
  }

  public async remove(roomId: string): Promise<DBRoomCatalog> {
    return this.write((current) => {
      current.rooms = current.rooms.filter((room) => room.id !== roomId);
    });
  }

  private async write(mutate: (catalog: DBRoomCatalog) => void): Promise<DBRoomCatalog> {
    const catalog = await this.dbs.commit(this.dbs.roomsDB, 'rooms', (current) => {
      const next = current ?? { ...EMPTY_CATALOG, levels: [], rooms: [] };

      mutate(next);
      next.version += 1;
      next.updatedAt = Date.now();

      return next;
    });

    if (!catalog) return this.get();

    try {
      container.resolve<SocketService>('socketService').io.of('/camera.ui').emit('rooms-changed', catalog);
    } catch {
      // ignore
    }

    return catalog;
  }
}

function qualify(name: string, note: string): string {
  if (name.endsWith(')')) return `${name.slice(0, -1)}, ${note})`;
  return `${name} (${note})`;
}

function uniqueName(name: string, levelId: string | null, rooms: DBRoom[]): string {
  const taken = new Set(rooms.filter((room) => room.levelId === levelId).map((room) => room.name.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;

  for (let suffix = 2; ; suffix++) {
    const candidate = `${name} ${suffix}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}
