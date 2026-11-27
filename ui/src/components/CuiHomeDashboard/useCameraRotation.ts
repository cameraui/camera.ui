import type { CameraActivity } from '@/components/CuiFloorplan/utils.js';
import type { DBHomeCameraFollow } from '@shared/types';
import type { Ref } from 'vue';

export type CameraStep = 'next' | 'previous';

export interface CameraRotationOptions {
  shownId: Ref<string>;
  ids: () => string[];
  seconds: () => number | undefined;
  follow: () => DBHomeCameraFollow | undefined;
  activity: () => Map<string, CameraActivity>;
  paused: () => boolean;
  waiting: () => boolean;
}

export function useCameraRotation(options: CameraRotationOptions) {
  const { ids, shownId } = options;

  const direction = ref<CameraStep>();

  const busy = computed(() => {
    const follow = options.follow();
    if (!follow) return [];
    return ids().filter((id) => {
      const seen = options.activity().get(id);
      return seen && (follow === 'motion' || seen.level === 'detection');
    });
  });

  // the camera on show keeps the card while it sees something
  const holding = computed(() => busy.value.includes(shownId.value));
  const timed = computed(() => !!options.seconds() && ids().length > 1 && !options.paused() && !options.waiting() && !holding.value);

  function show(id: string, step?: CameraStep) {
    if (id === shownId.value) return;
    const order = ids();
    direction.value = step ?? (order.indexOf(id) > order.indexOf(shownId.value) ? 'next' : 'previous');
    shownId.value = id;
  }

  function step(to: CameraStep) {
    const order = ids();
    if (order.length < 2) return;
    const index = order.indexOf(shownId.value);
    show(order[(index + (to === 'next' ? 1 : -1) + order.length) % order.length], to);
  }

  watch(
    [timed, options.seconds, shownId],
    ([on, seconds], _, onCleanup) => {
      if (!on || !seconds) return;
      const timer = setTimeout(() => step('next'), seconds * 1000);
      onCleanup(() => clearTimeout(timer));
    },
    { immediate: true },
  );

  watch(busy, (now, before) => {
    const fresh = now.find((id) => !before.includes(id));
    if (fresh && !options.paused() && !holding.value) show(fresh);
  });

  return { direction, timed, show, step };
}
