export function serverFlags(key: string) {
  async function read(): Promise<Record<string, boolean>> {
    try {
      const { Preferences } = await import('@capacitor/preferences');
      const { value } = await Preferences.get({ key });
      return value ? (JSON.parse(value) as Record<string, boolean>) : {};
    } catch {
      return {};
    }
  }

  async function has(serverId: string): Promise<boolean> {
    return (await read())[serverId] === true;
  }

  async function set(serverId: string, on: boolean): Promise<void> {
    try {
      const all = await read();
      if ((all[serverId] === true) === on) return;
      if (on) all[serverId] = true;
      else delete all[serverId];
      const { Preferences } = await import('@capacitor/preferences');
      await Preferences.set({ key, value: JSON.stringify(all) });
    } catch {
      // best-effort
    }
  }

  return { has, set };
}
