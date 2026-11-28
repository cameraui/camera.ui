<template>
  <header class="home-header" :class="{ 'home-header--editing': editing }">
    <div class="home-header__bar">
      <div class="home-header__start" :inert="saving">
        <div class="home-header__rooms" :style="{ '--fade-start': atStart ? '0px' : '2.5rem', '--fade-end': atEnd ? '0px' : '2.5rem' }">
          <nav ref="pagesRef" class="home-header__pages" :aria-label="t('views.home_dashboard.pages')" @scroll.passive="measure" @touchmove="holdScroll">
            <div
              v-for="tab in pages"
              :key="tab.id"
              class="home-pill"
              :class="{
                'home-pill--active': tab.id === page,
                'home-pill--sortable': editing && isRoomPage(tab.id),
                'home-pill--lifted': tab.id === sorting,
                'home-pill--hidden': tab.hidden,
              }"
              :style="{ order: order.indexOf(tab.id), transform: tab.id === sorting ? `translateX(${shift}px)` : undefined }"
              :data-page="tab.id"
              @pointerdown="grab($event, tab.id)"
            >
              <button type="button" class="home-pill__name" :aria-current="tab.id === page ? 'page' : undefined" @click="open(tab.id)">
                {{ tab.name }}
              </button>
              <button
                v-if="editing && isRoomPage(tab.id)"
                type="button"
                class="home-pill__eye"
                :aria-label="t(tab.hidden ? 'views.home_dashboard.room_show' : 'views.home_dashboard.room_hide', { name: tab.name })"
                :aria-pressed="tab.hidden"
                @click="emit('hide', tab.id, !tab.hidden)"
              >
                <i-mdi:eye-off-outline v-if="tab.hidden" />
                <i-mdi:eye-outline v-else />
              </button>
            </div>
          </nav>
          <button
            v-if="!atStart"
            type="button"
            class="home-header__arrow home-header__arrow--start"
            :aria-label="t('views.home_dashboard.rooms_back')"
            @click="scrollPages(-1)"
          >
            <i-mdi:chevron-left />
          </button>
          <button
            v-if="!atEnd"
            type="button"
            class="home-header__arrow home-header__arrow--end"
            :aria-label="t('views.home_dashboard.rooms_more')"
            @click="scrollPages(1)"
          >
            <i-mdi:chevron-right />
          </button>
        </div>
        <button
          v-if="admin && !kiosk"
          v-tooltip.bottom="t('components.form.button.create_room')"
          type="button"
          class="home-header__icon"
          :aria-label="t('components.form.button.create_room')"
          @click="openCreateRoom((room) => (page = room.id))"
        >
          <i-mdi:plus />
        </button>
      </div>

      <div class="home-header__actions">
        <template v-if="editing">
          <Button
            rounded
            severity="secondary"
            class="home-header__button"
            :label="t('views.home_dashboard.widgets')"
            :aria-expanded="panelOpen"
            :disabled="saving"
            @click="emit('panel')"
          >
            <template #icon>
              <i-mdi:plus />
            </template>
          </Button>
          <Button
            v-if="arrangeable"
            v-tooltip.bottom="t('views.home_dashboard.arrange_hint')"
            rounded
            severity="secondary"
            class="home-header__button"
            :label="t('views.home_dashboard.arrange')"
            :disabled="saving"
            @click="emit('arrange')"
          >
            <template #icon>
              <i-mdi:auto-fix />
            </template>
          </Button>
          <Button rounded severity="secondary" class="home-header__button" :label="t('components.form.button.cancel')" :disabled="saving" @click="emit('cancel')" />
          <Button rounded class="home-header__button" :label="t('views.home_dashboard.done')" :loading="saving" @click="emit('done')" />
        </template>
        <template v-else>
          <CuiHomeProfileMenu v-if="!kiosk" v-bind="profile" />
          <button
            v-tooltip.bottom="t(kiosk ? 'views.home_dashboard.kiosk_exit' : 'views.home_dashboard.kiosk')"
            type="button"
            class="home-header__icon"
            :aria-label="t(kiosk ? 'views.home_dashboard.kiosk_exit' : 'views.home_dashboard.kiosk')"
            :aria-pressed="kiosk"
            @click="kiosk = !kiosk"
          >
            <i-mdi:fullscreen-exit v-if="kiosk" />
            <i-mdi:fullscreen v-else />
          </button>
          <button
            v-if="!kiosk"
            v-tooltip.bottom="t('views.home_dashboard.edit')"
            type="button"
            class="home-header__icon"
            :aria-label="t('views.home_dashboard.edit')"
            @click="emit('edit')"
          >
            <i-mdi:pencil-outline />
          </button>
        </template>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { useCreateRoom } from '../CuiRoomSelect/useCreateRoom.js';
import CuiHomeProfileMenu from './CuiHomeProfileMenu.vue';
import { isRoomPage } from './pages.js';

import type { CuiHomeHeaderEmits, CuiHomeHeaderProps } from './types.js';

const props = defineProps<CuiHomeHeaderProps>();
const emit = defineEmits<CuiHomeHeaderEmits>();
const page = defineModel<string>('page', { required: true });

const { t } = useI18n();
const { enabled: kiosk } = useKioskMode();
const { openCreateRoom } = useCreateRoom();

const admin = hasPermission(undefined, 'admin');

const HOLD_MS = 300;
const SLOP_PX = 6;
const EDGE_PX = 48;
const SLIDE_MS = 200;
const CLICK_AFTER_DROP_MS = 300;
const PILL_FADE = 40;

const pagesRef = useTemplateRef<HTMLElement>('pagesRef');
const atStart = ref(true);
const atEnd = ref(true);
const sorting = ref<string>();
const shift = ref(0);
const order = ref<string[]>([]);

let pending: { id: string; pointerId: number; x: number; touch: boolean; timer?: ReturnType<typeof setTimeout> } | undefined;
let grabOffset = 0;
let droppedAt = 0;

useResizeObserver(pagesRef, measure);

function measure() {
  const nav = pagesRef.value;
  if (!nav) return;
  atStart.value = nav.scrollLeft <= 1;
  atEnd.value = nav.scrollLeft + nav.clientWidth >= nav.scrollWidth - 1;
}

function scrollPages(direction: number) {
  const nav = pagesRef.value;
  nav?.scrollBy({ left: direction * nav.clientWidth * 0.7, behavior: 'smooth' });
}

function open(id: string) {
  if (performance.now() - droppedAt < CLICK_AFTER_DROP_MS) return;
  page.value = id;
}

function grab(event: PointerEvent, id: string) {
  const onEye = (event.target as HTMLElement).closest('.home-pill__eye');
  if (!props.editing || !isRoomPage(id) || pending || onEye || (event.pointerType === 'mouse' && event.button !== 0)) return;
  const touch = event.pointerType !== 'mouse';
  pending = { id, pointerId: event.pointerId, x: event.clientX, touch };
  if (touch) pending.timer = setTimeout(lift, HOLD_MS);
  window.addEventListener('pointermove', follow);
  window.addEventListener('pointerup', drop);
  window.addEventListener('pointercancel', cancel);
}

function lift() {
  const pill = pending && pillOf(pending.id);
  if (!pending || !pill) return;
  grabOffset = pending.x - slotLeft(pill);
  shift.value = 0;
  sorting.value = pending.id;
  navigator.vibrate?.(10);
}

function follow(event: PointerEvent) {
  if (!pending || event.pointerId !== pending.pointerId) return;
  if (!sorting.value) {
    if (Math.abs(event.clientX - pending.x) <= SLOP_PX) return;
    if (pending.touch) {
      cancel();
      return;
    }
    lift();
  }
  edgeScroll(event.clientX);
  reorder(event.clientX);
}

function holdScroll(event: TouchEvent) {
  if (sorting.value && event.cancelable) event.preventDefault();
}

function edgeScroll(x: number) {
  const nav = pagesRef.value;
  if (!nav) return;
  const box = nav.getBoundingClientRect();
  if (x < box.left + EDGE_PX) nav.scrollLeft -= (box.left + EDGE_PX - x) / 4;
  else if (x > box.right - EDGE_PX) nav.scrollLeft += (x - box.right + EDGE_PX) / 4;
}

async function reorder(x: number) {
  const id = sorting.value!;
  const lifted = pillOf(id);
  if (!lifted) return;
  const middle = x - grabOffset + lifted.offsetWidth / 2;
  const others = order.value.filter((entry) => entry !== id);
  const index = others.findIndex((entry) => isRoomPage(entry) && middleOf(entry) > middle);
  const next = index < 0 ? [...others, id] : [...others.slice(0, index), id, ...others.slice(index)];
  if (next.join() !== order.value.join()) {
    const before = new Map(order.value.map((entry) => [entry, pillOf(entry)?.offsetLeft ?? 0]));
    order.value = next;
    await nextTick();
    slide(before, id);
  }
  shift.value = x - grabOffset - slotLeft(lifted);
}

function slide(before: Map<string, number>, lifted: string) {
  for (const [id, left] of before) {
    const pill = pillOf(id);
    const dx = pill ? left - pill.offsetLeft : 0;
    if (id !== lifted && dx) pill!.animate([{ transform: `translateX(${dx}px)` }, { transform: 'none' }], { duration: SLIDE_MS, easing: 'ease-out' });
  }
}

function pillOf(id: string): HTMLElement | undefined {
  return pagesRef.value?.querySelector<HTMLElement>(`[data-page="${CSS.escape(id)}"]`) ?? undefined;
}

function slotLeft(pill: HTMLElement): number {
  const nav = pagesRef.value!;
  return nav.getBoundingClientRect().left - nav.scrollLeft + pill.offsetLeft;
}

function middleOf(id: string): number {
  const pill = pillOf(id);
  return pill ? slotLeft(pill) + pill.offsetWidth / 2 : Infinity;
}

function drop(event: PointerEvent) {
  if (!pending || event.pointerId !== pending.pointerId) return;
  const id = sorting.value;
  const from = shift.value;
  stop();
  if (!id) return;
  droppedAt = performance.now();
  pillOf(id)?.animate([{ transform: `translateX(${from}px)` }, { transform: 'none' }], { duration: SLIDE_MS, easing: 'ease-out' });
  emit('reorder', order.value.filter(isRoomPage));
}

function cancel() {
  stop();
  order.value = props.pages.map((tab) => tab.id);
}

function stop() {
  clearTimeout(pending?.timer);
  pending = undefined;
  sorting.value = undefined;
  shift.value = 0;
  window.removeEventListener('pointermove', follow);
  window.removeEventListener('pointerup', drop);
  window.removeEventListener('pointercancel', cancel);
}

watch(
  () => props.pages.map((tab) => tab.id),
  (ids) => (order.value = ids),
  { immediate: true },
);

watch(page, (id) => {
  const nav = pagesRef.value;
  const pill = pillOf(id);
  if (!nav || !pill) return;
  const start = pill.offsetLeft - PILL_FADE;
  const end = pill.offsetLeft + pill.offsetWidth + PILL_FADE - nav.clientWidth;
  if (start < nav.scrollLeft) nav.scrollTo({ left: start, behavior: 'smooth' });
  else if (end > nav.scrollLeft) nav.scrollTo({ left: end, behavior: 'smooth' });
});

onBeforeUnmount(stop);
</script>

<style scoped>
.home-header {
  container: home-header / inline-size;
}

/* the wide column gap keeps the rooms apart from the buttons, so it stays clear what belongs where */
.home-header__bar {
  display: flex;
  align-items: center;
  gap: 0.75rem 3.5rem;
  min-height: 2.75rem;
}

.home-header__start {
  display: flex;
  flex: 0 1 auto;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.home-header__rooms {
  position: relative;
  display: flex;
  flex: 0 1 auto;
  min-width: 0;
  padding: 0.1875rem;
  border-radius: 9999px;
  border: 1px solid var(--border-color);
  background: var(--p-content-background);
}

@container home-header (width < 44rem) {
  .home-header--editing .home-header__bar {
    flex-direction: column;
    align-items: flex-end;
  }

  .home-header--editing .home-header__start {
    align-self: flex-start;
    max-width: 100%;
    order: 1;
  }
}

.home-header__arrow {
  position: absolute;
  top: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  background: var(--p-content-background);
  color: var(--text-secondary-color);
  transform: translateY(-50%);
  cursor: pointer;
}

.home-header__arrow:hover {
  color: var(--text-color);
}

.home-header__arrow--start {
  left: 0.25rem;
}

.home-header__arrow--end {
  right: 0.25rem;
}

.home-header__actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
  margin-left: auto;
}

.home-header__button {
  height: 2.75rem;
  padding-inline: 1.125rem;
  white-space: nowrap;
}

.home-header__icon {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 50%;
  border: 1px solid var(--border-color);
  background: var(--p-content-background);
  color: var(--text-color);
  cursor: pointer;
  transition: background 0.2s ease;
}

.home-header__icon:hover {
  background: var(--p-content-hover-background);
}

.home-header__icon:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
}

.home-header__icon svg {
  width: 1.25rem;
  height: 1.25rem;
}

.home-header__pages {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  gap: 0.125rem;
  min-width: 0;
  border-radius: 9999px;
  mask-image: linear-gradient(to right, transparent, #000 var(--fade-start), #000 calc(100% - var(--fade-end)), transparent);
  overflow-x: auto;
  scrollbar-width: none;
}

.home-header__pages::-webkit-scrollbar {
  display: none;
}

.home-pill {
  display: flex;
  flex: none;
  align-items: center;
  height: 2.25rem;
  border-radius: 9999px;
  color: var(--text-secondary-color);
  transition:
    background 0.2s ease,
    color 0.2s ease;
}

.home-pill:hover {
  color: var(--text-color);
}

.home-pill--active,
.home-pill--active:hover,
.home-pill--active.home-pill--lifted {
  background: var(--text-color);
  color: var(--p-content-background);
}

.home-pill__name {
  height: 100%;
  padding: 0 1.125rem;
  border-radius: inherit;
  background: transparent;
  color: inherit;
  font-size: 0.9375rem;
  font-weight: 600;
  white-space: nowrap;
  cursor: inherit;
}

.home-pill--sortable .home-pill__name {
  padding-right: 0.25rem;
}

.home-pill__eye {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  margin-right: 0.25rem;
  border-radius: 50%;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.home-pill__eye svg {
  width: 1rem;
  height: 1rem;
}

.home-pill--hidden .home-pill__name {
  opacity: 0.45;
}

.home-pill:not(.home-pill--sortable) {
  cursor: pointer;
}

.home-pill--sortable {
  cursor: grab;
}

.home-pill--lifted {
  position: relative;
  z-index: 1;
  background: var(--p-content-background);
  box-shadow: inset 0 0 0 2px var(--p-primary-color);
  cursor: grabbing;
}

.home-pill__name:focus-visible,
.home-pill__eye:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: -2px;
}
</style>
