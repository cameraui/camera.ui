import { EVENT_CATEGORIES, TIMELINE_DEFAULT_HIDDEN, TimelineFilterKey } from '@camera.ui/nvr';

import { CamerasQuery } from '@/api/routes/cameras.js';
import { patchUserFn, UsersQuery } from '@/api/routes/users.js';
import { showsMotionByDefault } from '@/utils/motionDefault.js';

import type { DBTimelineFilter, DBTimelinePreferences } from '@shared/types';
import type { MaybeRefOrGetter } from 'vue';

export function provideTimelineFilter(): void {
  const usersQuery = new UsersQuery();
  const camerasQuery = new CamerasQuery();
  const queryClient = useQueryClient();
  const authStore = useAuthStore();
  const instanceStore = useInstanceStore();
  const { user } = storeToRefs(authStore);

  const username = computed(() => user.value?.username ?? '');
  const { data: currentUser, refetch } = usersQuery.getUserQuery(username);
  const { data: cameras, refetch: refetchCameras } = camerasQuery.getCamerasQuery({ page: 1, pageSize: -1 }, () => Boolean(username.value));

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

  function defaultHidden(cameraId: string | undefined): string[] {
    const camera = cameraId ? cameras.value?.result.find((entry) => entry._id === cameraId) : undefined;
    if (camera && showsMotionByDefault(camera)) return TIMELINE_DEFAULT_HIDDEN.filter((type) => type !== EVENT_CATEGORIES.motion);
    return [...TIMELINE_DEFAULT_HIDDEN];
  }

  function field<K extends keyof DBTimelineFilter>(cameraId: MaybeRefOrGetter<string | undefined>, key: K, fallback: MaybeRefOrGetter<NonNullable<DBTimelineFilter[K]>>) {
    return computed({
      get: () => read(toValue(cameraId))[key] ?? toValue(fallback),
      set: (value) => {
        write(toValue(cameraId), { [key]: value });
      },
    });
  }

  // lives outside the remounted views, after queryClient.clear() it keeps the old server's data until it fetches
  watch(
    () => instanceStore.switchKey,
    () => {
      if (!username.value) return;
      refetch();
      refetchCameras();
    },
  );

  provide(TimelineFilterKey, (cameraId) => ({
    hiddenTypes: field(cameraId, 'hiddenTypes', () => defaultHidden(toValue(cameraId))),
    defaultHiddenTypes: computed(() => defaultHidden(toValue(cameraId))),
    scope: field(cameraId, 'scope', 'camera'),
    onlyMatches: field(cameraId, 'onlyMatches', true),
  }));
}
