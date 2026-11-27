<template>
  <Button
    v-tooltip.top="t('views.home_dashboard.scope')"
    rounded
    size="small"
    severity="secondary"
    :aria-label="t('views.home_dashboard.scope')"
    @click="menuRef?.toggleMenu($event)"
  >
    <template #icon>
      <i-mdi:door-open />
    </template>
  </Button>

  <CuiMenu ref="menuRef" :items max-height="60vh" />
</template>

<script setup lang="ts">
import HomeIcon from '~icons/mdi/home-outline';
import RoomIcon from '~icons/mdi/door-open';

import { HOME_PAGE } from './home.js';

import type { MenuItem } from '../CuiMenu/types.js';
import type { CuiHomeScopeOptionsEmits, CuiHomeScopeOptionsProps } from './types.js';

const props = defineProps<CuiHomeScopeOptionsProps>();
const emit = defineEmits<CuiHomeScopeOptionsEmits>();

const { t } = useI18n();

const menuRef = useTemplateRef('menuRef');

const items = computed<MenuItem[]>(() =>
  props.pages
    .filter((tab) => !tab.hidden || tab.id === props.scope)
    .map((tab) => ({
      key: tab.id,
      icon: tab.id === HOME_PAGE ? HomeIcon : RoomIcon,
      label: tab.id === HOME_PAGE ? t('views.home_dashboard.scope_all') : tab.name,
      active: props.scope === tab.id,
      onClick: () => emit('update', { room: tab.id }),
    })),
);
</script>
