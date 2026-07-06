import { UsersQuery } from '@/api/routes/users.js';

export function useUserOptions() {
  const usersQuery = new UsersQuery();
  const { data: usersData } = usersQuery.getUsersQuery({ page: 1, pageSize: -1 });

  const userOptions = computed(() =>
    (usersData.value?.result ?? []).map((u) => ({
      label: u.username,
      value: u.username,
    })),
  );

  return { userOptions };
}
