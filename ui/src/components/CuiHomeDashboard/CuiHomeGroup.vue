<template>
  <CuiTilePanel :icon="own ? FolderIcon : HOME_ICONS.group" :title="name" :state :active="activeCount > 0" class="home-group">
    <InputText
      v-if="own && editing"
      :model-value="name"
      class="home-group__name"
      :aria-label="t('views.home_dashboard.group_name')"
      @change="rename(($event.target as HTMLInputElement).value)"
    />
    <CuiHomePager class="home-group__body" :items="sensors" :row-height="MEMBER_HEIGHT" :min-width="MEMBER_WIDTH" :item-key="(sensor) => sensor.id">
      <template #default="{ item }">
        <div class="home-group__member">
          <CuiSensorTile :sensor="item" size="small" :disabled />
          <Button
            v-if="own && editing"
            rounded
            severity="secondary"
            class="home-group__take cui-icon-sm"
            :aria-label="t('views.home_dashboard.group_take_out', { name: item.displayName.value })"
            @click="emit('take', item.id)"
          >
            <template #icon>
              <i-mdi:minus />
            </template>
          </Button>
        </div>
      </template>
    </CuiHomePager>
  </CuiTilePanel>
</template>

<script setup lang="ts">
import FolderIcon from '~icons/mdi/folder-outline';

import { isSensorActive } from '@/common/sensorDisplay.js';
import CuiSensorTile from '@/components/CuiSensorTile/CuiSensorTile.vue';
import CuiTilePanel from '@/components/CuiSensorTile/frame/CuiTilePanel.vue';

import CuiHomePager from './CuiHomePager.vue';
import { HOME_ICONS } from './home.js';

import type { CuiHomeGroupEmits, CuiHomeGroupProps } from './types.js';

const props = defineProps<CuiHomeGroupProps>();
const emit = defineEmits<CuiHomeGroupEmits>();

const { t } = useI18n();

const MEMBER_WIDTH = 150;
const MEMBER_HEIGHT = 52;

const activeCount = computed(() => props.sensors.filter(isSensorActive).length);
const state = computed(() => t('views.home_dashboard.group_active', { active: activeCount.value, count: props.sensors.length }));

function rename(value: string) {
  const name = value.trim();
  if (name && name !== props.name) emit('update', { name });
}
</script>

<style scoped>
.home-group.tile-panel {
  position: relative;
  gap: 0.75rem;
  overflow: hidden;
}

.home-group__body {
  flex: 1;
  min-height: 0;
}

.home-group__member {
  position: relative;
  min-width: 0;
}

.home-group__take {
  position: absolute;
  top: 0.25rem;
  left: 0.25rem;
  z-index: 4;
  width: 1.5rem;
  height: 1.5rem;
}

.home-group__name {
  position: relative;
  z-index: 4;
  flex: none;
  height: 2.25rem;
}
</style>
