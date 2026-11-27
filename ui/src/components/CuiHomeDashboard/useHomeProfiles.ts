import { getUserFn, patchUserFn, UsersQuery } from '@/api/routes/users.js';
import { randomId } from '@/common/utils.js';

import { matchingProfile } from './layout.js';

import type { DBHomePage, DBHomeProfile } from '@shared/types';
import type { Ref } from 'vue';

export function useHomeProfiles(width: Ref<number>, height: Ref<number>) {
  const queryClient = useQueryClient();
  const { user } = storeToRefs(useAuthStore());
  const { uiSettings } = storeToRefs(useUiStore());

  const username = computed(() => user.value?.username ?? '');
  const { data: currentUser } = new UsersQuery().getUserQuery(username);

  const pending = ref<DBHomeProfile[]>();
  const fallback: DBHomeProfile = { id: randomId(), pages: [] };
  const held = ref<string>();

  const loaded = computed(() => currentUser.value !== undefined);
  const profiles = computed(() => {
    const stored = pending.value ?? currentUser.value?.preferences?.home?.profiles ?? [];
    return stored.length ? stored : [fallback];
  });
  const pinned = computed(() => profiles.value.find((entry) => entry.id === uiSettings.value.home.deviceProfiles[username.value]));
  const automatic = computed(() => matchingProfile(profiles.value, width.value, height.value)!);
  const profile = computed(() => profiles.value.find((entry) => entry.id === held.value) ?? pinned.value ?? automatic.value);

  async function save(changed: DBHomeProfile, pages: DBHomePage[] = []): Promise<void> {
    const fetched = await fetchProfiles();
    const stored = fetched.length ? fetched : [fallback];
    // another device may have saved a different page of it meanwhile
    const base = stored.find((entry) => entry.id === changed.id)?.pages ?? changed.pages;
    const next = { ...changed, pages: replacePages(base, pages) };
    await write(stored.some((entry) => entry.id === changed.id) ? stored.map((entry) => (entry.id === changed.id ? next : entry)) : [...stored, next]);
  }

  async function remove(id: string): Promise<void> {
    const stored = await fetchProfiles();
    await write(stored.filter((entry) => entry.id !== id));
    if (uiSettings.value.home.deviceProfiles[username.value] === id) choose(undefined);
  }

  function choose(id: string | undefined): void {
    if (id) uiSettings.value.home.deviceProfiles[username.value] = id;
    else delete uiSettings.value.home.deviceProfiles[username.value];
  }

  function hold(id: string | undefined): void {
    held.value = id;
  }

  async function fetchProfiles(): Promise<DBHomeProfile[]> {
    const fresh = await queryClient.fetchQuery({
      queryKey: ['users', username.value],
      queryFn: ({ signal }) => getUserFn({ username: username.value, signal }),
      staleTime: 0,
    });
    return fresh.preferences?.home?.profiles ?? [];
  }

  async function write(next: DBHomeProfile[]): Promise<void> {
    pending.value = next;
    try {
      await patchUserFn({ username: username.value, userData: { preferences: { home: { profiles: next } } } });
      await queryClient.invalidateQueries({ queryKey: ['users', username.value] });
    } finally {
      pending.value = undefined;
    }
  }

  return { profiles, profile, pinned, automatic, loaded, save, remove, choose, hold };
}

function replacePages(pages: DBHomePage[], changed: DBHomePage[]): DBHomePage[] {
  const ids = new Set(changed.map((page) => page.id));
  return [...pages.filter((page) => !ids.has(page.id)), ...changed];
}
