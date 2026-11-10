import { EVENT_CATEGORIES } from '@camera.ui/nvr';

import { UsersQuery } from '@/api/routes/users.js';
import { showsMotionByDefault } from '@/utils/motionDefault.js';

import type { DBCamera, EventTypesByCamera } from '@shared/types';
import type { MaybeRefOrGetter } from 'vue';

export interface RecentEventTypes {
  hidden: EventTypesByCamera;
  shown: EventTypesByCamera;
}

const MOTION: string = EVENT_CATEGORIES.motion;

export function useRecentEventTypes(cameras: MaybeRefOrGetter<DBCamera[] | undefined>) {
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
  const motionCameraIds = computed(() => new Set((toValue(cameras) ?? []).filter(showsMotionByDefault).map((camera) => camera._id)));
  const query = computed<RecentEventTypes>(() => {
    const next: RecentEventTypes = { hidden: { ...hidden.value }, shown: { ...shown.value } };
    for (const cameraId of motionCameraIds.value) {
      const motionOff = next.hidden[cameraId]?.includes(MOTION);
      next.hidden[cameraId] = without(next.hidden[cameraId], MOTION);
      next.shown[cameraId] = motionOff ? without(next.shown[cameraId], MOTION) : [...without(next.shown[cameraId], MOTION), MOTION];
    }
    return next;
  });
  const active = computed(
    () =>
      Object.values(hidden.value).some((types) => types.length > 0) ||
      Object.entries(shown.value).some(([cameraId, types]) => types.some((type) => type !== MOTION || !motionCameraIds.value.has(cameraId))),
  );
  const ready = computed(() => !username.value || [hiddenQuery, shownQuery].every((query) => query.data.value !== undefined || query.isError.value));
  const saving = computed(() => saveHidden.isPending.value || saveShown.isPending.value);

  async function save(next: RecentEventTypes): Promise<void> {
    await Promise.all([
      saveHidden.mutateAsync({ username: username.value, kind: 'hidden', types: next.hidden }),
      saveShown.mutateAsync({ username: username.value, kind: 'shown', types: next.shown }),
    ]);
  }

  return { hidden, shown, query, active, ready, saving, save };
}

function without(types: string[] | undefined, type: string): string[] {
  return (types ?? []).filter((entry) => entry !== type);
}
