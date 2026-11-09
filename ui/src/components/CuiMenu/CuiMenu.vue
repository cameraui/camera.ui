<template>
  <Popover ref="menuRef" class="shadow-lg cui-rounded-corner" :style="{ maxWidth: CUI_MENU_MAX_WIDTH }" v-bind="popover" @show="onShow" @hide="onHide">
    <DefineTemplate v-slot="{ item }">
      <CuiListItem
        :key="item.key"
        :to="item.to"
        class="min-h-10"
        active-class="!bg-primary-500/10"
        :disabled="item.disabled || item.loading"
        :button-props="item.buttonProps"
        :tooltip="item.tooltip"
        radius="none"
        :divider="item.showDivider"
        @click="onClickItem(item)"
      >
        <template v-if="item.avatarProps || item.icon" #prepend="{ isExactActive }">
          <CuiAvatar v-if="item.avatarProps" v-bind="item.avatarProps" />
          <component
            :is="item.icon"
            v-if="item.icon"
            v-bind="item.iconProps"
            :class="{
              'text-primary': isExactActive || item.active,
              'opacity-70': !item.disabled,
            }"
          />
        </template>

        <template #default="{ isExactActive }">
          <div class="flex items-center gap-3 min-w-0">
            <span
              v-bind="item.labelProps"
              class="truncate"
              :class="{
                'text-primary': isExactActive || item.active,
                '!font-bold': item.avatarProps,
                'opacity-70': !item.disabled,
              }"
              >{{ item.label }}</span
            >
            <div v-if="item.loading" class="flex items-center">
              <ProgressSpinner class="!w-3 !h-3" stroke-width="5" />
            </div>
            <span
              v-else-if="item.badge"
              v-bind="item.badgeProps"
              class="ml-auto min-w-6 text-xs font-medium tabular-nums text-center px-2 py-0.5 rounded-full bg-surface-200 dark:bg-surface-700 text-muted-color"
              >{{ item.badge }}</span
            >
          </div>
        </template>

        <template v-if="item.description" #subtitle>
          <span
            v-bind="item.descriptionProps"
            :class="{
              'opacity-70': !item.disabled,
            }"
          >
            {{ item.description }}
          </span>
        </template>

        <template v-if="item.toggle" #append>
          <ToggleSwitch :model-value="item.toggleState" :disabled="item.disabled" @update:model-value="onClickItem(item)" />
        </template>
      </CuiListItem>
    </DefineTemplate>

    <Card class="cui-card border-0!" :pt="{ body: { class: 'p-0' } }">
      <template #content>
        <div ref="scrollRef" class="overflow-y-auto overscroll-contain" :style="scrollStyle">
          <template v-for="(row, i) in rows" :key="i">
            <div v-if="row.type === 'group'" class="px-3 pt-3 pb-1 text-[0.7rem] font-semibold uppercase tracking-wider text-muted-color select-none">
              {{ row.label }}
            </div>
            <ReuseTemplate v-else :item="row.item" />
          </template>
        </div>
      </template>
    </Card>
  </Popover>
</template>

<script setup lang="ts">
import { closeOpenMenu, registerOpenMenu, releaseOpenMenu } from '@/common/menuRegistry.js';
import { CUI_MENU_CHROME, CUI_MENU_DEFAULTS, CUI_MENU_EDGE, CUI_MENU_MAX_WIDTH, CUI_MENU_MIN_HEIGHT } from './types.js';

import type { Popover } from 'openvue';
import type { CuiMenuEmits, CuiMenuProps, MenuItem } from './types.js';

const props = withDefaults(defineProps<CuiMenuProps>(), CUI_MENU_DEFAULTS);
const emit = defineEmits<CuiMenuEmits>();

const { items, autoHide, dividers, sortList, maxHeight } = toRefs(props);

type MenuRow = { type: 'group'; label: string } | { type: 'item'; item: MenuItem & { showDivider?: boolean } };

const [DefineTemplate, ReuseTemplate] = createReusableTemplate<{ item: MenuItem & { showDivider?: boolean } }>();

const menuRef = useTemplateRef<InstanceType<typeof Popover>>('menuRef');
const scrollRef = useTemplateRef<HTMLElement>('scrollRef');
const isOpen = ref(false);
const data = ref();
const fitHeight = ref<string>();
let edgeObserver: ResizeObserver | undefined;

const scrollStyle = computed(() => {
  const limit = typeof maxHeight.value === 'number' ? `${maxHeight.value}px` : maxHeight.value;
  if (!fitHeight.value) return limit ? { maxHeight: limit } : undefined;
  return { maxHeight: limit ? `min(${limit}, ${fitHeight.value})` : fitHeight.value };
});

const baseItems = computed<MenuItem[]>(() => {
  const _items = items.value.filter((item) => !item.hide);

  if (sortList.value) {
    return _items.sort((a, b) => {
      if (a.key && b.key) {
        return a.key.localeCompare(b.key);
      } else if (a.label && b.label) {
        return a.label.localeCompare(b.label);
      } else {
        return 0;
      }
    });
  }

  return _items;
});

const flatItems = computed<(MenuItem & { showDivider?: boolean })[]>(() => {
  const header = baseItems.value.filter((item) => item.position === 'header');
  const body = baseItems.value.filter((item) => !item.position);
  const footer = baseItems.value.filter((item) => item.position === 'footer');

  const all = [...header, ...body, ...footer];

  if (dividers.value === 'all') {
    return all.map((item, i) => ({ ...item, showDivider: i < all.length - 1 }));
  }

  const result: (MenuItem & { showDivider?: boolean })[] = [];

  for (let i = 0; i < header.length; i++) result.push({ ...header[i], showDivider: i < header.length - 1 || body.length > 0 || footer.length > 0 });
  for (let i = 0; i < body.length; i++) result.push({ ...body[i], showDivider: i < body.length - 1 ? false : footer.length > 0 });
  for (let i = 0; i < footer.length; i++) result.push(footer[i]);

  return result;
});

const rows = computed<MenuRow[]>(() => {
  const result: MenuRow[] = [];

  let lastGroup: string | undefined;
  for (const item of flatItems.value) {
    if (item.group && item.group !== lastGroup) {
      result.push({ type: 'group', label: item.group });
    }
    lastGroup = item.group;
    result.push({ type: 'item', item });
  }

  return result;
});

function onClickItem(item: MenuItem) {
  if (autoHide.value) {
    hide();
  }

  item.onClick?.(toRaw(data.value));
  emit('click:menu-item', item);
}

function onShow() {
  registerOpenMenu(hide);
  watchScreenEdges();
  isOpen.value = true;
  emit('show');
}

function onHide() {
  edgeObserver?.disconnect();
  edgeObserver = undefined;
  releaseOpenMenu(hide);
  data.value = undefined;
  isOpen.value = false;
  emit('hide');
}

function toggleMenu(event: Event, target?: any, customData?: any) {
  closeOpenMenu(hide);
  data.value = customData;
  fitToScreen(target ?? event.currentTarget);
  menuRef.value?.toggle(event, target);
}

function hide() {
  menuRef.value?.hide();
}

function show(event: Event, target?: any) {
  closeOpenMenu(hide);
  fitToScreen(target ?? event.currentTarget);
  menuRef.value?.show(event, target);
}

function fitToScreen(anchor: unknown) {
  if (!(anchor instanceof Element)) return;
  const { top, bottom } = anchor.getBoundingClientRect();
  const below = window.innerHeight - bottom;
  const space = Math.max(Math.max(below, top) - CUI_MENU_CHROME - CUI_MENU_EDGE, CUI_MENU_MIN_HEIGHT);
  fitHeight.value = `calc(${space}px - var(--safe-area-inset-${below >= top ? 'bottom' : 'top'}))`;
}

function watchScreenEdges() {
  const popover = scrollRef.value?.closest<HTMLElement>('[data-pc-name="popover"]');
  if (!popover) return;
  edgeObserver = new ResizeObserver(() => keepInsideScreen(popover));
  edgeObserver.observe(popover);
}

function keepInsideScreen(popover: HTMLElement) {
  // offsets, the enter animation scales the bounding rect
  const left = popover.offsetLeft - window.scrollX;
  const right = left + popover.offsetWidth;
  const shift = left < CUI_MENU_EDGE ? CUI_MENU_EDGE - left : Math.min(window.innerWidth - CUI_MENU_EDGE - right, 0);
  if (shift) popover.style.insetInlineStart = `${parseFloat(popover.style.insetInlineStart || '0') + shift}px`;
}

defineExpose({
  menu: menuRef,
  isOpen,
  data: toRaw(data),
  toggleMenu,
  hide,
  show,
});
</script>
