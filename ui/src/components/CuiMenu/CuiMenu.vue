<template>
  <DefineTemplate v-slot="{ item }">
    <CuiListItem
      :key="item.key"
      :to="item.to"
      :class="asSheet ? 'min-h-12' : 'min-h-10'"
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

      <template v-if="item.toggle || item.actions?.length" #append>
        <ToggleSwitch v-if="item.toggle" :model-value="item.toggleState" :disabled="item.disabled" @update:model-value="onClickItem(item)" />
        <template v-else>
          <Button
            v-for="action in item.actions"
            :key="action.label"
            v-tooltip="action.label"
            text
            rounded
            severity="secondary"
            class="cui-icon-md"
            :aria-label="action.label"
            @click="onClickAction(action)"
          >
            <template #icon>
              <component :is="action.icon" width="100%" height="100%" />
            </template>
          </Button>
        </template>
      </template>
    </CuiListItem>
  </DefineTemplate>

  <DefineRows>
    <template v-for="(row, i) in rows" :key="i">
      <div v-if="row.type === 'group'" class="px-3 pt-3 pb-1 text-[0.7rem] font-semibold uppercase tracking-wider text-muted-color select-none">
        {{ row.label }}
      </div>
      <ReuseTemplate v-else :item="row.item" />
    </template>
  </DefineRows>

  <DefineFooter>
    <div v-if="footerItems.length" class="shrink-0" :class="{ 'menu-footer': rows.length }">
      <ReuseTemplate v-for="item in footerItems" :key="item.key ?? item.label" :item />
    </div>
  </DefineFooter>

  <Popover ref="menuRef" class="shadow-lg cui-rounded-corner" :style="{ maxWidth: CUI_MENU_MAX_WIDTH }" v-bind="popoverProps" @show="onShow" @hide="onHide">
    <Card class="cui-card border-0!" :pt="{ body: { class: 'p-0' } }">
      <template #content>
        <div class="flex flex-col" :style="scrollStyle">
          <div ref="scrollRef" class="min-h-0 overflow-y-auto overscroll-contain">
            <ReuseRows />
          </div>
          <ReuseFooter />
        </div>
      </template>
    </Card>
  </Popover>

  <CuiBottomSheet v-if="sheet" v-model="sheetOpen">
    <div class="-mx-3 pt-2">
      <ReuseRows />
      <ReuseFooter />
    </div>
  </CuiBottomSheet>
</template>

<script setup lang="ts">
import { closeOpenMenu, registerOpenMenu, releaseOpenMenu } from '@/common/menuRegistry.js';
import { usePhoneSheet, usePopoverFit } from '@/common/popoverFit.js';
import { CUI_MENU_DEFAULTS, CUI_MENU_MAX_WIDTH } from './types.js';

import type { Popover } from 'openvue';
import type { CuiMenuEmits, CuiMenuProps, MenuItem, MenuItemAction } from './types.js';

const props = withDefaults(defineProps<CuiMenuProps>(), CUI_MENU_DEFAULTS);
const emit = defineEmits<CuiMenuEmits>();

const { items, autoHide, dividers, sortList, maxHeight } = toRefs(props);

type MenuRow = { type: 'group'; label: string } | { type: 'item'; item: MenuItem & { showDivider?: boolean } };

const [DefineTemplate, ReuseTemplate] = createReusableTemplate<{ item: MenuItem & { showDivider?: boolean } }>();
const [DefineRows, ReuseRows] = createReusableTemplate();
const [DefineFooter, ReuseFooter] = createReusableTemplate();

const menuRef = useTemplateRef<InstanceType<typeof Popover>>('menuRef');
const scrollRef = useTemplateRef<HTMLElement>('scrollRef');
const isOpen = ref(false);
const data = ref();
const { fitHeight, fit, keepInside, release } = usePopoverFit();
const { phoneBreakpoint, sheetOpen } = usePhoneSheet(hide);

const asSheet = computed(() => props.sheet && phoneBreakpoint.value);
const popoverProps = computed(() => ({ ...props.popover, pt: { ...props.popover?.pt, content: { class: 'p-0! rounded-xl! overflow-hidden!' } } }));

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
  const all = [...header, ...body];

  if (dividers.value === 'all') {
    return all.map((item, i) => ({ ...item, showDivider: i < all.length - 1 }));
  }

  return [...header.map((item, i) => ({ ...item, showDivider: i < header.length - 1 || body.length > 0 })), ...body];
});

const footerItems = computed<(MenuItem & { showDivider?: boolean })[]>(() => {
  const footer = baseItems.value.filter((item) => item.position === 'footer');
  return footer.map((item, i) => ({ ...item, showDivider: dividers.value === 'all' && i < footer.length - 1 }));
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

function onClickAction(action: MenuItemAction) {
  if (autoHide.value) hide();
  action.onClick();
}

watch(sheetOpen, (opened) => {
  isOpen.value = opened;
  if (!opened) data.value = undefined;
  if (opened) emit('show');
  else emit('hide');
});

function onShow() {
  registerOpenMenu(hide);
  keepInside(scrollRef.value);
  isOpen.value = true;
  emit('show');
}

function onHide() {
  release();
  releaseOpenMenu(hide);
  data.value = undefined;
  isOpen.value = false;
  emit('hide');
}

function toggleMenu(event: Event, target?: any, customData?: any) {
  closeOpenMenu(hide, target ?? event.currentTarget);
  data.value = customData;
  if (asSheet.value) {
    sheetOpen.value = !sheetOpen.value;
    return;
  }
  fit(target ?? event.currentTarget);
  menuRef.value?.toggle(event, target);
}

function hide() {
  sheetOpen.value = false;
  menuRef.value?.hide();
}

function show(event: Event, target?: any) {
  closeOpenMenu(hide, target ?? event.currentTarget);
  if (asSheet.value) {
    sheetOpen.value = true;
    return;
  }
  fit(target ?? event.currentTarget);
  menuRef.value?.show(event, target);
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

<style scoped>
.menu-footer {
  border-top: 1px solid var(--divider-color);
}
</style>
