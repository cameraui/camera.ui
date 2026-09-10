import { randomUUID } from 'node:crypto';
import { container } from 'tsyringe';

import type { Database } from '../api/database/index.js';
import type { DBAssistantProfile } from '../api/database/types.js';
import type { CreateAssistantProfileInput, PatchAssistantProfileInput } from '../api/schemas/assistant.schema.js';

const MAX_PROFILES_PER_USER = 20;
const KEY_END = '\uffff';

export class AssistantProfileStore {
  private dbs: Database;

  constructor() {
    this.dbs = container.resolve<Database>('dbs');
  }

  public list(userId: string): DBAssistantProfile[] {
    const prefix = `${userId}/`;
    return Array.from(this.dbs.assistantProfilesDB.getRange({ start: prefix, end: `${prefix}${KEY_END}` }))
      .map((entry) => entry.value)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  public async create(userId: string, input: CreateAssistantProfileInput): Promise<DBAssistantProfile> {
    if (this.list(userId).length >= MAX_PROFILES_PER_USER) throw new Error(`At most ${MAX_PROFILES_PER_USER} profiles per user`);
    const now = Date.now();
    const profile: DBAssistantProfile = {
      _id: randomUUID(),
      userId,
      name: input.name,
      disabledGroups: input.disabledGroups,
      instructions: input.instructions,
      createdAt: now,
      updatedAt: now,
    };
    await this.dbs.assistantProfilesDB.put(profileKey(userId, profile._id), profile);
    return profile;
  }

  public async update(userId: string, profileId: string, patch: PatchAssistantProfileInput): Promise<DBAssistantProfile | undefined> {
    return this.dbs.commit(this.dbs.assistantProfilesDB, profileKey(userId, profileId), (current) =>
      current ? { ...current, ...patch, updatedAt: Date.now() } : undefined,
    );
  }

  public async remove(userId: string, profileId: string): Promise<boolean> {
    const key = profileKey(userId, profileId);
    if (!this.dbs.assistantProfilesDB.get(key)) return false;
    await this.dbs.assistantProfilesDB.remove(key);
    return true;
  }

  public async removeAll(userId: string): Promise<void> {
    const owned = this.list(userId);
    await this.dbs.assistantProfilesDB.transaction(() => {
      for (const profile of owned) this.dbs.assistantProfilesDB.remove(profileKey(userId, profile._id));
    });
  }
}

function profileKey(userId: string, profileId: string): string {
  return `${userId}/${profileId}`;
}
