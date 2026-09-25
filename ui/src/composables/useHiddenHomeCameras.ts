import { patchUserFn, UsersQuery } from '@/api/routes/users.js';

export function useHiddenHomeCameras() {
  const usersQuery = new UsersQuery();
  const queryClient = useQueryClient();
  const authStore = useAuthStore();
  const { user } = storeToRefs(authStore);

  const username = computed(() => user.value?.username ?? '');

  const { data: currentUser } = usersQuery.getUserQuery(username);

  const pending = ref<string[]>();

  const hiddenIds = computed(() => new Set(pending.value ?? currentUser.value?.preferences?.home?.hiddenCameras ?? []));

  async function toggle(cameraId: string): Promise<void> {
    const next = new Set(hiddenIds.value);
    if (!next.delete(cameraId)) next.add(cameraId);
    pending.value = [...next];

    try {
      await patchUserFn({ username: username.value, userData: { preferences: { home: { hiddenCameras: pending.value } } } });
      await queryClient.invalidateQueries({ queryKey: ['users', username.value] });
    } finally {
      pending.value = undefined;
    }
  }

  return { hiddenIds, toggle };
}
