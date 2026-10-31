import { TIMELINE_DEFAULT_HIDDEN, TimelineFilterKey } from '@camera.ui/nvr';

import { patchUserFn, UsersQuery } from '@/api/routes/users.js';

import type { DBTimelineFilter } from '@shared/types';

export function provideTimelineFilter(): void {
  const usersQuery = new UsersQuery();
  const queryClient = useQueryClient();
  const authStore = useAuthStore();
  const { user } = storeToRefs(authStore);

  const username = computed(() => user.value?.username ?? '');

  const { data: currentUser } = usersQuery.getUserQuery(username);

  const pending = ref<DBTimelineFilter>();

  const filter = computed<DBTimelineFilter>(() => pending.value ?? currentUser.value?.preferences?.timeline ?? {});

  let saving = 0;

  async function save(next: DBTimelineFilter): Promise<void> {
    pending.value = next;
    if (!username.value) return;

    saving++;
    try {
      await patchUserFn({ username: username.value, userData: { preferences: { timeline: next } } });
      await queryClient.invalidateQueries({ queryKey: ['users', username.value] });
    } finally {
      // a later toggle is still on its way, its value stays until it lands
      if (--saving === 0) pending.value = undefined;
    }
  }

  function field<K extends keyof DBTimelineFilter>(key: K, fallback: NonNullable<DBTimelineFilter[K]>) {
    return computed({
      get: () => filter.value[key] ?? fallback,
      set: (value) => {
        save({ ...filter.value, [key]: value });
      },
    });
  }

  provide(TimelineFilterKey, {
    hiddenTypes: field('hiddenTypes', [...TIMELINE_DEFAULT_HIDDEN]),
    scope: field('scope', 'camera'),
    onlyMatches: field('onlyMatches', true),
  });
}
