import { useNvrDataEpoch } from '@camera.ui/nvr';

import { findItems } from '@/components/CuiFindObjectView/utils.js';

import type { FindObjectState, FindPick, FrozenPicture } from '@/components/CuiFindObjectView/types.js';
import type { SimilarSearchRequest } from '@/components/CuiSimilarPicker/types.js';
import type { NVRInterface, TimelineSegment } from '@camera.ui/nvr';
import type { Promisify } from '@camera.ui/rpc';
import type { DBCamera } from '@shared/types';
import type { MaybeRefOrGetter } from 'vue';

export interface UseFindObjectOptions {
  shown?: MaybeRefOrGetter<boolean>;
  pickable?: MaybeRefOrGetter<boolean>;
  searchable?: MaybeRefOrGetter<boolean>;
}

const pages: FindObjectState[] = [];

export function useFindObject(options: UseFindObjectOptions = {}): FindObjectState {
  const log = useLogger('FindObject');
  const { plugin } = usePlugin('@camera.ui/camera-ui-nvr');

  const segment = ref<TimelineSegment>('timeline');
  const picks = shallowRef<FindPick[]>([]);
  const licenseRequired = shallowRef(false);
  const openedKey = shallowRef<string>();
  const breadth = ref(100);
  const runs = new Map<number, number>();
  const frozen = new Set<FrozenPicture>();
  let nextId = 0;

  const baseViews: TimelineSegment[] = ['timeline', 'detections'];
  const findViews: TimelineSegment[] = [...baseViews, 'find'];

  const available = computed(() => Boolean(plugin.value) && hasPermission(undefined, 'admin'));
  const views = computed(() => (available.value && toValue(options.searchable ?? true) ? findViews : baseViews));
  const armed = computed(() => available.value && segment.value === 'find' && toValue(options.shown ?? true));
  const pickable = computed(() => available.value && toValue(options.pickable ?? true));
  const items = computed(() => findItems(picks.value, breadth.value));
  const searched = computed(() => picks.value.some((pick) => pick.result));
  const keys = computed(() => (searched.value ? items.value.map((item) => item.key) : undefined));
  const count = computed(() => (searched.value ? items.value.length : undefined));

  function add(camera: DBCamera, request: SimilarSearchRequest): void {
    const pick: FindPick = { id: ++nextId, camera, request, searching: true };
    picks.value = [...picks.value, pick];
    segment.value = 'find';
    search(pick);
  }

  function remove(id: number): void {
    runs.delete(id);
    picks.value = picks.value.filter((pick) => pick.id !== id);
  }

  function openView(): void {
    segment.value = 'find';
  }

  function toggleView(): void {
    segment.value = segment.value === 'find' ? 'timeline' : 'find';
  }

  function endSearch(): void {
    releaseAll(true);
    runs.clear();
    picks.value = [];
    breadth.value = 100;
    licenseRequired.value = false;
    openedKey.value = undefined;
  }

  function track(picture: FrozenPicture): () => void {
    frozen.add(picture);
    return () => frozen.delete(picture);
  }

  function releaseAll(resume: boolean): void {
    for (const picture of [...frozen]) picture.release(resume);
  }

  function update(id: number, changes: Pick<FindPick, 'result' | 'searching'>): void {
    picks.value = picks.value.map((pick) => (pick.id === id ? { ...pick, ...changes } : pick));
  }

  async function search(pick: FindPick): Promise<void> {
    const nvr = plugin.value as unknown as Promisify<NVRInterface> | undefined;
    if (!nvr) return;
    const run = (runs.get(pick.id) ?? 0) + 1;
    runs.set(pick.id, run);
    try {
      const result = await nvr.searchSimilarQuery(pick.request.query, {});
      if (runs.get(pick.id) !== run) return;
      update(pick.id, { result, searching: false });
      licenseRequired.value = false;
    } catch (err) {
      if (runs.get(pick.id) !== run) return;
      update(pick.id, { result: undefined, searching: false });
      if (String((err as Error)?.message ?? err).includes('license verification required')) licenseRequired.value = true;
      else log.error('Similar search failed:', err);
    }
  }

  function typing(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null;
    return Boolean(element && (element.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)));
  }

  const state: FindObjectState = {
    segment,
    views,
    available,
    armed,
    pickable,
    picks,
    items,
    keys,
    count,
    breadth,
    licenseRequired,
    openedKey,
    add,
    remove,
    openView,
    toggleView,
    endSearch,
    track,
    releaseAll,
  };

  watch(
    () => Boolean(plugin.value),
    (ready) => {
      if (!ready) return;
      for (const pick of picks.value) if (pick.searching) search(pick);
    },
  );

  // another plugin instance holds other events
  watch(useNvrDataEpoch(), () => {
    picks.value = picks.value.map((pick) => ({ ...pick, result: undefined, searching: true }));
    for (const pick of picks.value) search(pick);
  });

  onKeyStroke(['f', 'F', 'Escape'], (event) => {
    if (pages.at(-1) !== state || event.metaKey || event.ctrlKey || event.altKey || typing(event.target)) return;
    if (event.key === 'Escape') {
      releaseAll(true);
      return;
    }
    if (!views.value.includes('find')) return;
    event.preventDefault();
    toggleView();
  });

  onMounted(() => pages.push(state));

  onBeforeUnmount(() => {
    const index = pages.indexOf(state);
    if (index >= 0) pages.splice(index, 1);
  });

  return state;
}
