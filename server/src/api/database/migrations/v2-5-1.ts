import type { Migration } from './types.js';

const migration: Migration = {
  version: '2.5.1',
  description: 'ollama models follow the default for picking tools first',
  async up(ctx) {
    const { assistantDB } = ctx.db;
    const settings = assistantDB.get('assistant');
    if (!settings) return;
    const models = settings.models.map((entry) => (entry.provider === 'ollama' && entry.toolRouting === false ? { ...entry, toolRouting: null } : entry));
    await assistantDB.put('assistant', { ...settings, models });
  },
};

export default migration;
