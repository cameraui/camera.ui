import { TIMELINE_DEFAULT_HIDDEN, TimelineFilterKey } from '@camera.ui/nvr';

import { patchUserFn, UsersQuery } from '@/api/routes/users.js';

import type { DBTimelineFilter, DBTimelinePreferences } from '@shared/types';
import type { MaybeRefOrGetter } from 'vue';

export function provideTimelineFilter(): void {
  const usersQuery = new UsersQuery();
  const queryClient = useQueryClient();
  const authStore = useAuthStore();
  const { user } = storeToRefs(authStore);

  const username = computed(() => user.value?.username ?? '');
  const { data: currentUser } = usersQuery.getUserQuery(username);

  const pending = ref<DBTimelinePreferences>();
  const timeline = computed<DBTimelinePreferences>(() => pending.value ?? currentUser.value?.preferences?.timeline ?? {});

  let saving = 0;

  function read(cameraId: string | undefined): DBTimelineFilter {
    if (!cameraId) return timeline.value;
    return timeline.value.cameras?.[cameraId] ?? {};
  }

  function merged(cameraId: string | undefined, change: DBTimelineFilter): DBTimelinePreferences {
    if (!cameraId) return { ...timeline.value, ...change };
    return { ...timeline.value, cameras: { ...timeline.value.cameras, [cameraId]: { ...read(cameraId), ...change } } };
  }

  async function write(cameraId: string | undefined, change: DBTimelineFilter): Promise<void> {
    pending.value = merged(cameraId, change);
    if (!username.value) return;

    saving++;
    try {
      const delta = cameraId ? { cameras: { [cameraId]: change } } : change;
      await patchUserFn({ username: username.value, userData: { preferences: { timeline: delta } } });
      await queryClient.invalidateQueries({ queryKey: ['users', username.value] });
    } finally {
      // a later toggle is still on its way, its value stays until it lands
      if (--saving === 0) pending.value = undefined;
    }
  }

  function field<K extends keyof DBTimelineFilter>(cameraId: MaybeRefOrGetter<string | undefined>, key: K, fallback: NonNullable<DBTimelineFilter[K]>) {
    return computed({
      get: () => read(toValue(cameraId))[key] ?? fallback,
      set: (value) => {
        write(toValue(cameraId), { [key]: value });
      },
    });
  }

  provide(TimelineFilterKey, (cameraId) => ({
    hiddenTypes: field(cameraId, 'hiddenTypes', [...TIMELINE_DEFAULT_HIDDEN]),
    scope: field(cameraId, 'scope', 'camera'),
    onlyMatches: field(cameraId, 'onlyMatches', true),
  }));
}
