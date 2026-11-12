<template>
  <div class="flex flex-col h-full min-h-0">
    <DefineRow v-slot="{ item, series, nested }">
      <div
        class="notification-row flex gap-3 sm:gap-4 px-2 cursor-pointer select-none"
        :class="[
          nested ? 'py-2 items-center' : 'py-3 items-start',
          { 'notification-row-active': !selectionMode && item.id === selected?.id && (!mdBreakpoint || sheetOpen) },
        ]"
        @click="onRowClick(item)"
      >
        <div
          v-if="selectionMode"
          class="w-6 h-6 self-center rounded-full border-2 flex items-center justify-center transition-colors shrink-0"
          :class="selectedIds.has(item.id) ? 'bg-primary border-primary' : 'border-color'"
        >
          <i-mdi:check v-if="selectedIds.has(item.id)" class="w-4 h-4 text-white" />
        </div>

        <span class="hidden sm:block w-11 shrink-0 text-xs text-muted tabular-nums" :class="{ 'pt-0.5': !nested }">{{ formatTime(item.createdAt) }}</span>

        <div
          class="relative flex items-center justify-center w-16 aspect-video rounded-md overflow-hidden shrink-0"
          :class="[imageOf(item) ? 'bg-black' : tileClass(item), { 'ring-2 ring-red-500': isAlarm(item) }]"
        >
          <img v-if="imageOf(item)" :src="imageOf(item)" alt="" loading="lazy" decoding="async" class="w-full h-full object-cover" />
          <component :is="sourceOf(item).icon" v-else class="w-4.5 h-4.5" />
          <span v-if="videoOf(item)" class="absolute right-0.5 bottom-0.5 flex items-center justify-center w-3.5 h-3.5 rounded-full bg-black/60 text-white">
            <i-mdi:play class="w-2.5 h-2.5" />
          </span>
        </div>

        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5">
            <span v-if="severityIcon(item)" v-tooltip.top="{ value: severityLabel(item) }" class="flex shrink-0">
              <component :is="severityIcon(item)" class="w-4 h-4" :class="severityTextClass(item)" />
            </span>
            <span v-if="nested" class="text-sm truncate text-color">{{ item.subtitle || item.body || item.title }}</span>
            <span v-else class="text-sm truncate text-color" :class="item.seenAt == null ? 'font-semibold' : 'font-medium'">{{ item.title }}</span>
            <span v-if="hasUnread(item, series)" class="w-2 h-2 rounded-full bg-primary-500 shrink-0" />
            <span class="ml-auto pl-2 flex items-center gap-1 shrink-0 text-xs text-muted">
              <template v-if="!nested && showsSource(item)">
                <span class="max-w-28 sm:max-w-48 truncate">{{ sourceOf(item).label }}</span>
                <span class="sm:hidden">·</span>
              </template>
              <span class="sm:hidden tabular-nums">{{ formatTime(item.createdAt) }}</span>
            </span>
          </div>
          <template v-if="!nested">
            <p v-if="summaryOf(item)" class="text-[13px] text-muted line-clamp-2 mt-0.5">{{ summaryOf(item) }}</p>
            <p v-if="occurrencesOf(item)" class="text-xs text-muted mt-0.5">{{ occurrencesOf(item) }}</p>
            <span v-if="series?.length" class="inline-flex items-center gap-0.5 mt-1 text-xs font-medium text-primary cursor-pointer" @click.stop="toggleSeries(item.id)">
              {{ t('views.notifications.series_more', { count: series.length }) }}
              <i-mdi:chevron-down class="w-4 h-4 transition-transform duration-200" :class="{ 'rotate-180': expandedIds.has(item.id) }" />
            </span>
          </template>
        </div>
      </div>
    </DefineRow>

    <h1 v-if="!smBreakpoint" class="page-title">
      {{ t('views.notifications.title') }}
    </h1>

    <CuiTopbarSlot position="left">
      <Button severity="secondary" text class="cui-button p-2 text-color non-draggable-region" @click="goBack('/home')">
        <template #icon>
          <i-weui:back-filled class="w-6 h-6" />
        </template>
      </Button>
    </CuiTopbarSlot>

    <div class="flex gap-2 mb-4">
      <InputGroup class="flex-1">
        <IconField class="flex-1">
          <InputIcon>
            <i-carbon:search class="w-4 h-4" />
          </InputIcon>
          <InputText v-model="searchQuery" :placeholder="t('views.notifications.search')" class="w-full" />
        </IconField>
        <InputGroupAddon>
          <Button severity="secondary" text :class="activeFilter === 'all' ? 'text-color' : 'text-primary'" @click="openFilterMenu">
            <template #icon>
              <i-mdi:filter-variant class="w-4 h-4" />
            </template>
          </Button>
        </InputGroupAddon>
        <InputGroupAddon v-if="sourcePicker">
          <Button severity="secondary" text :class="activeSource ? 'text-primary' : 'text-color'" @click="openSourceMenu">
            <template #icon>
              <component :is="activeFilter === 'cameras' ? CameraIcon : PluginIcon" class="w-4 h-4" />
            </template>
          </Button>
        </InputGroupAddon>
      </InputGroup>
      <Button
        v-tooltip.left="{ value: t('views.notifications.settings') }"
        severity="secondary"
        outlined
        class="cui-button shrink-0"
        @click="$router.push('/settings/notifications')"
      >
        <template #icon>
          <i-carbon:settings class="w-4.5 h-4.5" />
        </template>
      </Button>
    </div>

    <div class="flex flex-1 min-h-0 gap-4">
      <div class="relative flex-1 min-w-0">
        <div ref="listRef" class="h-full overflow-y-auto overscroll-contain pb-[var(--cui-bottom-gap)]">
          <Transition name="fade-2" mode="out-in">
            <div v-if="groups.length" key="content" class="flex flex-col gap-4">
              <section v-for="group in groups" :key="group.key" :data-day="group.label" class="notification-day">
                <span class="card-title text-color">{{ group.label }}</span>
                <div class="flex flex-col divide-y divide-(--border-color)">
                  <div v-for="row in group.rows" :key="row.head.id">
                    <ReuseRow :item="row.head" :series="row.series" />
                    <div v-if="row.series.length && expandedIds.has(row.head.id)" class="ml-4 mb-2 border-l-2 border-primary-500/30">
                      <ReuseRow v-for="child in row.series" :key="child.id" :item="child" :nested="true" />
                    </div>
                  </div>
                </div>
              </section>
              <div v-if="loading" class="flex justify-center py-2">
                <ProgressSpinner stroke-width="5" class="w-[30px] h-[30px]" />
              </div>
            </div>

            <div v-else-if="loading" key="loading" class="flex justify-center py-20">
              <ProgressSpinner stroke-width="5" class="w-[30px] h-[30px]" />
            </div>

            <div v-else key="empty" class="flex flex-col items-center justify-center w-full h-full gap-4 py-20">
              <i-mdi:bell-outline class="w-12 h-12 text-muted" />
              <span class="text-muted text-sm">{{ t('views.notifications.empty') }}</span>
            </div>
          </Transition>
        </div>

        <div class="absolute top-2 left-1/2 -translate-x-1/2 z-2 flex flex-col items-center gap-2 pointer-events-none">
          <Transition name="fade-2">
            <span v-if="stuckDay" class="px-3 py-1 rounded-full text-xs font-medium text-color bg-(--card-background) border border-color shadow-md whitespace-nowrap">
              {{ stuckDay }}
            </span>
          </Transition>
          <Transition name="slide-down">
            <Button
              v-if="incoming.length"
              rounded
              class="cui-button-small shadow-md pointer-events-auto"
              :label="t('views.notifications.new_count', { count: incoming.length })"
              @click="showIncoming"
            >
              <template #icon>
                <i-mdi:arrow-up class="w-4 h-4" />
              </template>
            </Button>
          </Transition>
        </div>
      </div>

      <Transition name="slide-left">
        <div v-if="selected && !mdBreakpoint" class="w-[340px] xl:w-[420px] shrink-0 pb-[var(--cui-bottom-gap)]">
          <Card class="cui-card" :pt="{ body: { class: 'p-0 gap-0' } }">
            <template #content>
              <div class="h-full overflow-y-auto overscroll-contain">
                <CuiNotificationDetail :notification="selected" closable @close="center.close()" @toggle-seen="toggleSeen" @remove="deleteItem" />
              </div>
            </template>
          </Card>
        </div>
      </Transition>
    </div>

    <CuiBottomSheet v-model="sheetOpen">
      <div class="-mx-4">
        <CuiNotificationDetail v-if="selected" :notification="selected" @navigate="sheetOpen = false" @toggle-seen="toggleSeen" @remove="deleteItem" />
      </div>
    </CuiBottomSheet>

    <CuiMenu ref="filterMenuRef" :items="filterMenuItems" :popover="menuPopover" />
    <CuiMenu ref="sourceMenuRef" :items="sourceMenuItems" :popover="menuPopover" />

    <CuiFloatingButtonGroup v-if="items.length" :force-visible="selectionMode" :scroll-y="scrollY">
      <template v-if="!selectionMode">
        <CuiFloatingButton
          :tooltip-props="{ value: t('views.notifications.select') }"
          :button-props="{ severity: 'secondary' }"
          :icon="SelectIcon"
          :icon-props="{ width: '100%', height: '100%' }"
          @click="enterSelectionMode"
        />
        <CuiFloatingButton
          v-if="unread"
          :tooltip-props="{ value: t('components.notification_menu.mark_all_read') }"
          :button-props="{ class: 'text-white' }"
          :icon="CheckAllIcon"
          :icon-props="{ width: '100%', height: '100%' }"
          @click="center.markSeen()"
        />
      </template>

      <template v-else>
        <CuiFloatingButton
          :tooltip-props="{ value: t('components.form.tooltip.cancel_selection') }"
          :button-props="{ severity: 'secondary' }"
          :icon="CloseIcon"
          :icon-props="{ width: '100%', height: '100%' }"
          @click="exitSelectionMode"
        />
        <CuiFloatingButton
          :tooltip-props="{ value: allSelected ? t('views.notifications.deselect_all') : t('views.notifications.select_all') }"
          :button-props="{ severity: allSelected ? 'primary' : 'secondary' }"
          :icon="SelectAllIcon"
          :icon-props="{ width: '100%', height: '100%' }"
          @click="toggleSelectAll"
        />
        <CuiFloatingButton
          :tooltip-props="{ value: t('views.notifications.mark_read_selected') }"
          :button-props="{ severity: 'secondary', disabled: !selectedIds.size }"
          :icon="CheckIcon"
          :icon-props="{ width: '100%', height: '100%' }"
          @click="markSelectedRead"
        />
        <CuiFloatingButton
          :tooltip-props="{ value: t('views.notifications.delete_selected') }"
          :button-props="{ severity: 'danger', disabled: !selectedIds.size }"
          :icon="TrashIcon"
          :icon-props="{ width: '100%', height: '100%' }"
          @click="deleteSelected"
        />
      </template>
    </CuiFloatingButtonGroup>
  </div>
</template>

<script setup lang="ts">
import { NOTIFICATION_FILTERS, notificationBucket, notificationCameraId } from '@shared/types';
import CameraIcon from '~icons/bx/cctv';
import SelectAllIcon from '~icons/fluent/select-all-on-20-filled';
import CheckIcon from '~icons/mdi/check';
import CheckAllIcon from '~icons/mdi/check-all';
import CloseIcon from '~icons/mdi/close';
import TrashIcon from '~icons/mdi/delete-outline';
import PluginIcon from '~icons/mdi/puzzle-outline';
import SelectIcon from '~icons/tabler/dots-filled';

import CuiMenu from '@/components/CuiMenu/CuiMenu.vue';

import type { MenuItem } from '@/components/CuiMenu/types.js';
import type { NotificationFilter, StoredNotification } from '@shared/types';

interface NotificationRow {
  head: StoredNotification;
  series: StoredNotification[];
}

interface NotificationGroup {
  key: string;
  label: string;
  rows: NotificationRow[];
}

const { goBack } = useBackNavigation();
const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const { smBreakpoint, mdBreakpoint } = useSharedCuiBreakpoint();
const { registerScrollToTop } = useCuiTopbarSlots();
const { sourceOf, summaryOf, occurrencesOf, showsSource, imageOf, videoOf, isAlarm, severityLabel, severityIcon, severityTextClass, tileClass, dayLabel, formatTime } =
  useNotificationDisplay();
const activeFilter = useLocalStorage<NotificationFilter>('cui-notifications-filter', 'all');
const [DefineRow, ReuseRow] = createReusableTemplate<{ item: StoredNotification; series?: StoredNotification[]; nested?: boolean }>();

const SERIES_GAP = 5 * 60_000;
const menuPopover = { pt: { root: { class: 'min-w-56' }, content: { class: 'p-0! rounded-xl! overflow-hidden!' } } };

const searchQuery = ref('');
const appliedQuery = ref('');
const activeSource = ref('');
const sheetOpen = ref(false);
const expandedIds = ref(new Set<string>());
const stuckDay = ref<string>();
const filterMenuRef = useTemplateRef<InstanceType<typeof CuiMenu>>('filterMenuRef');
const sourceMenuRef = useTemplateRef<InstanceType<typeof CuiMenu>>('sourceMenuRef');
const listRef = useTemplateRef<HTMLElement>('listRef');

const center = useNotificationCenter({ filter: activeFilter, query: appliedQuery, source: activeSource, isAtTop: () => (listRef.value?.scrollTop ?? 0) <= 40 });
const { items, incoming, counts, sources, unread, loading, hasMore, selected } = center;

const filterMenuItems = computed<MenuItem[]>(() =>
  NOTIFICATION_FILTERS.map((key) => {
    const count = counts.value[key] ?? 0;
    return {
      key,
      label: t(`views.notifications.filter_${key}`),
      badge: String(count),
      active: activeFilter.value === key,
      hide: key !== 'all' && key !== 'unread' && key !== activeFilter.value && !count,
      onClick: () => {
        activeFilter.value = key;
        activeSource.value = '';
      },
    };
  }),
);

const sourcePicker = computed(() => (activeFilter.value === 'cameras' || activeFilter.value === 'plugins') && (sources.value.length > 1 || !!activeSource.value));

const sourceMenuItems = computed<MenuItem[]>(() => [
  {
    key: 'all',
    label: t('views.notifications.filter_all'),
    badge: String(counts.value[activeFilter.value] ?? 0),
    active: !activeSource.value,
    onClick: () => {
      activeSource.value = '';
    },
  },
  ...sources.value.map((source) => ({
    key: source.id,
    label: source.name,
    badge: String(source.count),
    active: activeSource.value === source.id,
    onClick: () => {
      activeSource.value = source.id;
    },
  })),
]);

const groups = computed<NotificationGroup[]>(() => {
  const byDay = new Map<string, StoredNotification[]>();
  for (const item of items.value) {
    const key = new Date(item.createdAt).toDateString();
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(item);
  }
  return Array.from(byDay, ([key, dayItems]) => ({ key, label: dayLabel(dayItems[0].createdAt), rows: toRows(dayItems) }));
});

const { selectionMode, selectedIds, allSelected, enterSelectionMode, exitSelectionMode, toggleSelectAll, toggleSelection } = useCardSelection(items, (item) => item.id);

const { y: scrollY } = useScroll(listRef, { throttle: 100 });

registerScrollToTop(() => listRef.value?.scrollTo({ top: 0, behavior: 'smooth' }));

const { reset: checkLoadMore } = useInfiniteScroll(listRef, center.loadMore, { distance: 400, canLoadMore: () => hasMore.value });

useEventListener(listRef, 'scroll', updateStuckDay, { passive: true });

function openFilterMenu(event: Event) {
  center.refreshCounts();
  filterMenuRef.value?.toggleMenu(event);
}

function openSourceMenu(event: Event) {
  center.refreshCounts();
  sourceMenuRef.value?.toggleMenu(event);
}

function showIncoming() {
  if ((listRef.value?.scrollTop ?? 0) < 8) center.mergeIncoming();
  // webkit cancels a smooth scroll when rows land above it, the scrollY watcher merges once the list is at the top
  else listRef.value?.scrollTo({ top: 0, behavior: 'smooth' });
}

function toRows(list: StoredNotification[]): NotificationRow[] {
  const rows: NotificationRow[] = [];
  for (const item of list) {
    const last = rows.at(-1);
    const previous = last?.series.at(-1) ?? last?.head;
    if (last && previous && sameSeries(previous, item)) last.series.push(item);
    else rows.push({ head: item, series: [] });
  }
  return rows;
}

function sameSeries(newer: StoredNotification, older: StoredNotification): boolean {
  if (newer.log || older.log || newer.createdAt - older.createdAt > SERIES_GAP) return false;
  const cameraId = notificationCameraId(newer);
  if (cameraId) return cameraId === notificationCameraId(older);
  return notificationBucket(newer) === notificationBucket(older) && newer.title === older.title;
}

function updateStuckDay() {
  const list = listRef.value;
  if (!list) return;

  const top = list.getBoundingClientRect().top;
  let day: string | undefined;
  for (const section of Array.from(list.querySelectorAll<HTMLElement>('[data-day]'))) {
    if (section.getBoundingClientRect().top > top) break;
    day = section.firstElementChild!.getBoundingClientRect().bottom <= top ? section.dataset.day : undefined;
  }
  stuckDay.value = day;
}

function hasUnread(item: StoredNotification, series?: StoredNotification[]): boolean {
  return item.seenAt == null || !!series?.some((entry) => entry.seenAt == null);
}

function onRowClick(item: StoredNotification) {
  if (selectionMode.value) {
    toggleSelection(item.id);
    return;
  }

  center.select(item);
  if (mdBreakpoint.value) sheetOpen.value = true;
}

async function openFromQuery() {
  const id = route.query.id;
  if (typeof id !== 'string') return;

  await center.open(id);
  if (selected.value && mdBreakpoint.value) sheetOpen.value = true;

  // without the id in the url the same link opens the entry again
  const query = { ...route.query };
  delete query.id;
  router.replace({ query });
}

function toggleSeries(id: string) {
  if (expandedIds.value.has(id)) expandedIds.value.delete(id);
  else expandedIds.value.add(id);
}

function toggleSeen(item: StoredNotification) {
  center.setSeen(item, item.seenAt == null);
}

function deleteItem(item: StoredNotification) {
  center.remove([item.id]);
  sheetOpen.value = false;
}

function markSelectedRead() {
  center.markSeen([...selectedIds.value]);
  exitSelectionMode();
}

function deleteSelected() {
  center.remove([...selectedIds.value]);
  exitSelectionMode();
}

watch(scrollY, (y) => {
  if (y < 8 && incoming.value.length) center.mergeIncoming();
});

// a deletion shrinks the list without a scroll, the next page would never load
watch(
  () => items.value.length,
  (length, previous) => {
    if (length < previous) checkLoadMore();
  },
);

watch([activeFilter, appliedQuery, activeSource], () => {
  listRef.value?.scrollTo({ top: 0 });
  center.reload();
});

watchDebounced(
  searchQuery,
  (query) => {
    appliedQuery.value = query.trim();
  },
  { debounce: 300 },
);

watch(groups, updateStuckDay, { flush: 'post' });

watch(() => route.query.id, openFromQuery);

onMounted(() => {
  center.loadMore();
  openFromQuery();
});
</script>

<style scoped>
.notification-day {
  content-visibility: auto;
  contain-intrinsic-size: auto 480px;
}

.notification-row:hover {
  background: var(--card-inner-background);
}

.notification-row-active,
.notification-row-active:hover {
  background: color-mix(in srgb, var(--p-primary-color) 10%, transparent);
}
</style>
