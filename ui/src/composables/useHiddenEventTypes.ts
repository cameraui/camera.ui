import { UsersQuery } from '@/api/routes/users.js';

import type { HiddenEventTypes } from '@shared/types';

export function useHiddenEventTypes() {
  const usersQuery = new UsersQuery();
  const authStore = useAuthStore();
  const { user } = storeToRefs(authStore);

  const username = computed(() => user.value?.username ?? '');

  const { data, isError } = usersQuery.getHiddenEventTypesQuery(username);
  const { mutateAsync, isPending: saving } = usersQuery.putHiddenEventTypesQuery();

  const hidden = computed<HiddenEventTypes>(() => data.value ?? {});
  const active = computed(() => Object.values(hidden.value).some((types) => types.length > 0));
  const ready = computed(() => !username.value || data.value !== undefined || isError.value);

  function save(next: HiddenEventTypes): Promise<HiddenEventTypes> {
    return mutateAsync({ username: username.value, hidden: next });
  }

  return { hidden, active, ready, saving, save };
}
