import { UsersQuery } from '@/api/routes/users.js';

import type { EventTypesByCamera } from '@shared/types';

export interface RecentEventTypes {
  hidden: EventTypesByCamera;
  shown: EventTypesByCamera;
}

export function useRecentEventTypes() {
  const usersQuery = new UsersQuery();
  const authStore = useAuthStore();
  const { user } = storeToRefs(authStore);

  const username = computed(() => user.value?.username ?? '');

  const hiddenQuery = usersQuery.getEventTypesQuery(username, 'hidden');
  const shownQuery = usersQuery.getEventTypesQuery(username, 'shown');
  const saveHidden = usersQuery.putEventTypesQuery();
  const saveShown = usersQuery.putEventTypesQuery();

  const hidden = computed<EventTypesByCamera>(() => hiddenQuery.data.value ?? {});
  const shown = computed<EventTypesByCamera>(() => shownQuery.data.value ?? {});
  const active = computed(() => [hidden.value, shown.value].some((byCamera) => Object.values(byCamera).some((types) => types.length > 0)));
  const ready = computed(() => !username.value || [hiddenQuery, shownQuery].every((query) => query.data.value !== undefined || query.isError.value));
  const saving = computed(() => saveHidden.isPending.value || saveShown.isPending.value);

  async function save(next: RecentEventTypes): Promise<void> {
    await Promise.all([
      saveHidden.mutateAsync({ username: username.value, kind: 'hidden', types: next.hidden }),
      saveShown.mutateAsync({ username: username.value, kind: 'shown', types: next.shown }),
    ]);
  }

  return { hidden, shown, active, ready, saving, save };
}
