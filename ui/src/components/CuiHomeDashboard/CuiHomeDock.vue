<template>
  <div v-if="keys.length || editing" ref="slotRef" class="home-dock" :class="inline ? 'home-dock--inline' : 'home-dock--fixed'">
    <Transition name="home-dock-fade">
      <div v-if="openItem" class="home-dock__scrim" @click="open = undefined" />
    </Transition>

    <div class="home-dock__bar" :style="inline ? undefined : { left: `${left}px`, width: `${width}px` }">
      <Transition name="home-dock-rise">
        <CuiHomeDockPanel v-if="!inline && openItem" :item="openItem" :cameras :tiles :room-names="roomNames" :inline="false" @close="open = undefined" />
      </Transition>

      <nav ref="listRef" class="home-dock__items" :class="{ 'home-dock__items--editing': editing }" :aria-label="t('views.home_dashboard.dock')">
        <CuiHomeDockItem
          v-for="item in rendered"
          :key="item.key"
          :data-dock-key="item.key"
          :style="{ order: keys.indexOf(item.key) }"
          :item
          :inline
          :editing
          :open="open === item.key"
          :dragging="dragKey === item.key"
          @select="open = open === item.key ? undefined : item.key"
          @remove="order = keys.filter((key) => key !== item.key)"
          @drag="dragOver(item.key, $event)"
          @drop="dragKey = swappedWith = undefined"
        />
        <button
          v-if="editing && hiddenKeys.length"
          type="button"
          class="home-dock__add"
          :class="{ 'home-dock__add--inline': inline }"
          :style="{ order: keys.length }"
          :aria-label="t('views.home_dashboard.dock_add')"
          @click="menuRef?.toggleMenu($event)"
        >
          <i-mdi:plus />
        </button>
      </nav>
    </div>

    <Transition name="home-dock-drop">
      <CuiHomeDockPanel
        v-if="inline && openItem"
        :item="openItem"
        :cameras
        :tiles
        :room-names="roomNames"
        inline
        class="home-dock__overlay"
        :style="{ maxHeight: `calc(100dvh - ${bottom}px - var(--cui-bottom-bar) - var(--cui-bottom-gap) - 1.5rem)` }"
        @close="open = undefined"
      />
    </Transition>
    <CuiMenu v-if="editing" ref="menuRef" :items="addItems" />
  </div>
</template>

<script setup lang="ts">
import { SecuritySystemProperty } from '@camera.ui/sdk';
import { HOME_DOCK_KEYS } from '@shared/types';

import { isSensorActive, securityColor, sensorIcon, sensorStatus, sensorToneColor, sensorTypeIcon, toneColor } from '@/common/sensorDisplay.js';

import CuiHomeDockItem from './CuiHomeDockItem.vue';
import CuiHomeDockPanel from './CuiHomeDockPanel.vue';
import { DOCK_CATEGORIES, HOME_ICONS, opened, unlocked } from './home.js';

import type { ReactiveSensor } from '@camera.ui/browser';
import type { DBHomeDockKey } from '@shared/types';
import type { CuiHomeDockProps, HomeDockCategory, HomeDockItem, HomePoint } from './types.js';

const props = defineProps<CuiHomeDockProps>();
const order = defineModel<DBHomeDockKey[]>('order');

const { t } = useI18n();

const slotRef = useTemplateRef<HTMLDivElement>('slotRef');
const listRef = useTemplateRef<HTMLElement>('listRef');
const menuRef = useTemplateRef('menuRef');
const open = ref<DBHomeDockKey>();
const dragKey = ref<DBHomeDockKey>();

let swappedWith: DBHomeDockKey | undefined;

const { left, width, bottom } = useElementBounding(slotRef);
const pageLocked = useScrollLock(document.documentElement);

onKeyStroke('Escape', () => (open.value = undefined));

const available = computed(() => {
  const items = new Map<DBHomeDockKey, HomeDockItem>();
  for (const category of DOCK_CATEGORIES) {
    const sensors = props.tiles.filter((sensor) => category.types.includes(sensor.type));
    items.set(category.key, dockItem(category, sensors));
  }
  const count = props.cameras.length;
  items.set('cameras', {
    key: 'cameras',
    icon: HOME_ICONS.camera,
    label: t('views.home_dashboard.dock_cameras'),
    state: count ? t('views.home_dashboard.dock_camera_count', { count }, count) : t('views.home_dashboard.dock_none'),
    active: false,
  });
  return items;
});

const keys = computed(() => (order.value ?? HOME_DOCK_KEYS).filter((key) => available.value.has(key)));
const rendered = computed(() => HOME_DOCK_KEYS.filter((key) => keys.value.includes(key)).map((key) => available.value.get(key)!));
const hiddenKeys = computed(() => HOME_DOCK_KEYS.filter((key) => available.value.has(key) && !keys.value.includes(key)));
const addItems = computed(() =>
  hiddenKeys.value.map((key) => {
    const item = available.value.get(key)!;
    return { key, label: item.label, icon: item.icon, onClick: () => add(key) };
  }),
);
const openItem = computed(() => (open.value ? available.value.get(open.value) : undefined));

async function add(key: DBHomeDockKey) {
  order.value = [...keys.value, key];
  if (!props.inline) return;
  await nextTick();
  listRef.value?.scrollTo({ left: listRef.value.scrollWidth, behavior: 'smooth' });
}

async function dragOver(key: DBHomeDockKey, event: HomePoint) {
  dragKey.value = key;
  const cards = Array.from(listRef.value?.querySelectorAll<HTMLElement>('[data-dock-key]') ?? []);
  const target = cards.find((el) => {
    const rect = el.getBoundingClientRect();
    return el.dataset.dockKey !== key && event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
  });
  const targetKey = target?.dataset.dockKey as DBHomeDockKey | undefined;
  if (targetKey === swappedWith) return;
  swappedWith = targetKey;
  if (!targetKey) return;

  const before = new Map(cards.map((el) => [el, el.getBoundingClientRect()]));
  const rest = keys.value.filter((entry) => entry !== key);
  rest.splice(keys.value.indexOf(targetKey), 0, key);
  order.value = rest;

  await nextTick();
  for (const [el, rect] of before) {
    if (el.dataset.dockKey === key) continue;
    const now = el.getBoundingClientRect();
    const dx = rect.left - now.left;
    const dy = rect.top - now.top;
    if (dx || dy) el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 220, easing: 'ease-out' });
  }
}

function dockItem({ key, types }: HomeDockCategory, sensors: ReactiveSensor[]): HomeDockItem {
  const label = t(`views.home_dashboard.dock_${key}`);
  if (!sensors.length) return { key, label, icon: sensorTypeIcon(types[0], false), state: t('views.home_dashboard.dock_none'), active: false };

  if (key === 'security') {
    const [system] = sensors;
    return {
      key,
      label,
      icon: sensorIcon(system.type, system),
      state: sensorStatus(system.type, system, t),
      active: isSensorActive(system),
      color: securityColor(system.getProperty(SecuritySystemProperty.CurrentState)),
    };
  }

  if (key === 'locks' || key === 'openings') {
    const count = sensors.filter(key === 'locks' ? unlocked : opened).length;
    return {
      key,
      label,
      icon: sensorTypeIcon(types[0], count > 0),
      state: count ? t('views.home_dashboard.dock_open', { count }) : t('views.home_dashboard.dock_closed'),
      active: count > 0,
      color: toneColor('warn'),
    };
  }

  const on = sensors.filter(isSensorActive);
  return {
    key,
    label,
    icon: sensorTypeIcon(types[0], on.length > 0),
    state: on.length ? t('views.home_dashboard.dock_on', { count: on.length }) : t('views.home_dashboard.dock_off'),
    active: on.length > 0,
    color: on.length ? sensorToneColor(on[0].type, true) : undefined,
  };
}

watch(
  () => props.editing,
  () => (open.value = undefined),
);

watchEffect(() => (pageLocked.value = props.inline && !!openItem.value));
</script>

<style scoped>
.home-dock--fixed {
  height: 4rem;
}

.home-dock--inline {
  position: relative;
  z-index: 16;
}

.home-dock--inline .home-dock__bar {
  position: relative;
  z-index: 16;
}

.home-dock__overlay {
  position: absolute;
  top: calc(100% + 0.5rem);
  left: 0;
  right: 0;
  z-index: 16;
  overflow-y: auto;
  box-shadow: 0 24px 64px rgb(0 0 0 / 0.35);
}

.home-dock--fixed .home-dock__bar {
  position: fixed;
  bottom: calc(var(--cui-bottom-bar) + var(--cui-bottom-gap));
  z-index: 16;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.home-dock__scrim {
  position: fixed;
  inset: 0;
  z-index: 15;
  background: rgb(0 0 0 / 0.45);
}

.home-dock__items {
  position: relative;
  display: flex;
  gap: 0.625rem;
}

.home-dock--fixed .home-dock__items::before {
  content: '';
  position: absolute;
  inset: -1.5rem 0 calc(-1 * (var(--cui-bottom-bar) + var(--cui-bottom-gap)));
  z-index: -1;
  background: linear-gradient(to bottom, transparent, var(--ground-background) 40%);
  pointer-events: none;
}

.home-dock--inline .home-dock__items {
  overflow-x: auto;
  scrollbar-width: none;
}

.home-dock--inline .home-dock__items::-webkit-scrollbar {
  display: none;
}

.home-dock--inline .home-dock__items--editing {
  padding: 0.5rem 0 0 0.5rem;
}

.home-dock__add {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 4rem;
  height: 4rem;
  border-radius: 1.375rem;
  border: 1px dashed var(--border-color);
  background: transparent;
  color: var(--text-secondary-color);
  cursor: pointer;
}

.home-dock__add--inline {
  width: 3.5rem;
  height: 3.5rem;
  border-radius: 9999px;
}

.home-dock__add:hover {
  color: var(--text-color);
}

.home-dock__add svg {
  width: 1.5rem;
  height: 1.5rem;
}

.home-dock-fade-enter-active,
.home-dock-fade-leave-active {
  transition: opacity 0.2s ease;
}

.home-dock-fade-enter-from,
.home-dock-fade-leave-to {
  opacity: 0;
}

.home-dock-drop-enter-active,
.home-dock-drop-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.25s ease;
}

.home-dock-drop-enter-from,
.home-dock-drop-leave-to {
  opacity: 0;
  transform: translateY(-0.5rem);
}

.home-dock-rise-enter-active,
.home-dock-rise-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.25s ease;
}

.home-dock-rise-enter-from,
.home-dock-rise-leave-to {
  opacity: 0;
  transform: translateY(1rem);
}
</style>
