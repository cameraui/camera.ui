<template>
  <CuiTileWidget
    ref="widgetRef"
    class="home-presence"
    :icon="PeopleIcon"
    :title="name"
    :state="line"
    :summary
    :color
    :active="home.length > 0"
    :offline
    :hero
    :hero-note="heroNote"
    :hero-word="narrow"
    extra-shows-hero
    @open="listRef?.toggle($event)"
  >
    <template #extra>
      <CuiHomePager class="home-presence__rows" :items="people" :row-height="ROW_HEIGHT" :min-width="ROW_WIDTH" :item-key="(person) => person.sensor.id">
        <template #default="{ item }">
          <CuiHomePerson :person="item" row />
        </template>
      </CuiHomePager>
    </template>

    <CuiHomePager v-if="form !== 'tall'" :items="people" :row-height="avatarRow" :min-width="avatarWidth" :item-key="(person) => person.sensor.id">
      <template #default="{ item }">
        <CuiHomePerson :person="item" :size="avatarSize" :named="!narrow" :placed />
      </template>
    </CuiHomePager>
  </CuiTileWidget>

  <CuiPopoverSheet ref="listRef">
    <div class="cui-tile home-presence__list" :style="{ '--tile-color': color }">
      <CuiHomePerson v-for="person in people" :key="person.sensor.id" :person row />
    </div>
  </CuiPopoverSheet>

  <CuiSensorTileSheet v-if="sheetSensor" ref="sheetRef" :sensor="sheetSensor" :disabled />
</template>

<script setup lang="ts">
import PeopleIcon from '~icons/mdi/account-group-outline';

import CuiPopoverSheet from '@/components/CuiPopoverSheet/CuiPopoverSheet.vue';
import CuiSensorTileSheet from '@/components/CuiSensorTile/CuiSensorTileSheet.vue';
import CuiTileWidget from '@/components/CuiSensorTile/frame/CuiTileWidget.vue';

import CuiHomePager from '../CuiHomePager.vue';
import CuiHomePerson from './CuiHomePerson.vue';
import { useMemberSheet } from './memberSheet.js';
import { usePresenceGroup } from './presence.js';

import type { CuiHomeGroupDesignProps } from '../types.js';

const props = defineProps<CuiHomeGroupDesignProps>();

const { t } = useI18n();

const { people, home, away, offline, color } = usePresenceGroup(() => props.sensors);

const ROW_WIDTH = 180;
const ROW_HEIGHT = 48;
const COMPACT_CHROME = 76;
const SHORT_CHROME = 144;
const PLACED_HEIGHT = 76;
const NAMED_HEIGHT = 60;
const NAMED_WIDTH = 64;

const widgetRef = useTemplateRef<InstanceType<typeof CuiTileWidget>>('widgetRef');
const listRef = useTemplateRef<InstanceType<typeof CuiPopoverSheet>>('listRef');
const sheetRef = useTemplateRef<InstanceType<typeof CuiSensorTileSheet>>('sheetRef');

const { sheetSensor } = useMemberSheet(sheetRef);

const widgetEl = computed(() => widgetRef.value?.$el as HTMLElement | undefined);
const { height } = useElementSize(widgetEl, undefined, { box: 'border-box' });

const form = computed(() => widgetRef.value?.form ?? 'short');
const narrow = computed(() => widgetRef.value?.narrow ?? false);
const everyone = computed(() => people.value.length > 0 && !away.value.length);
const nobody = computed(() => !home.value.length);
const line = computed(() => {
  if (offline.value) return t('connection.offline');
  if (everyone.value) return t('views.home_dashboard.groups.presence.all_home');
  if (nobody.value) return t('views.home_dashboard.groups.presence.nobody_home');
  return away.value.map((person) => person.label).join(', ');
});
const summary = computed(() => {
  if (offline.value) return t('connection.offline');
  if (everyone.value) return t('views.home_dashboard.groups.presence.all_home');
  if (nobody.value) return t('views.home_dashboard.groups.presence.all_away');
  return t('views.home_dashboard.groups.presence.count_home', { count: home.value.length });
});
const hero = computed(() => {
  if (offline.value) return t('connection.offline');
  if (narrow.value) {
    if (everyone.value) return t('views.home_dashboard.groups.presence.all_here');
    if (nobody.value) return t('views.home_dashboard.groups.presence.nobody_here');
    return t('views.home_dashboard.groups.presence.count_home', { count: home.value.length });
  }
  if (everyone.value) return t('views.home_dashboard.groups.presence.all_home');
  if (nobody.value) return t('views.home_dashboard.groups.presence.nobody_home');
  return String(home.value.length);
});
const heroNote = computed(() => {
  if (offline.value || narrow.value || everyone.value || nobody.value) return undefined;
  return t('views.home_dashboard.groups.presence.of_home', { total: people.value.length });
});
const avatarSize = computed(() => {
  if (!narrow.value) return 40;
  return form.value === 'compact' ? 28 : 36;
});
const placed = computed(() => !narrow.value && height.value - (form.value === 'compact' ? COMPACT_CHROME : SHORT_CHROME) >= PLACED_HEIGHT);
const avatarWidth = computed(() => (narrow.value ? avatarSize.value : NAMED_WIDTH));
const avatarRow = computed(() => {
  if (narrow.value) return avatarSize.value;
  return placed.value ? PLACED_HEIGHT : NAMED_HEIGHT;
});
</script>

<style scoped>
.home-presence :deep(.tile-widget__body:empty) {
  display: none;
}

.home-presence__rows {
  align-self: stretch;
}

.home-presence__list {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}
</style>
