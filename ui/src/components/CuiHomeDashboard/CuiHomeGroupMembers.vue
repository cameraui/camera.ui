<template>
  <Button
    v-tooltip.top="t('views.home_dashboard.group_members')"
    rounded
    size="small"
    severity="secondary"
    :aria-label="t('views.home_dashboard.group_members')"
    @click="popoverRef?.toggle($event)"
  >
    <template #icon>
      <i-mdi:format-list-bulleted />
    </template>
  </Button>

  <CuiPopoverSheet ref="popoverRef" width="18rem">
    <div class="home-members">
      <InputText
        :model-value="name ?? ''"
        :placeholder
        :aria-label="t('views.home_dashboard.group_name')"
        @change="emit('update', { name: ($event.target as HTMLInputElement).value.trim() || undefined })"
      />
      <ul class="flex flex-col gap-1">
        <li v-for="sensor in sensors" :key="sensor.id" class="home-members__row">
          <component :is="sensorIcon(sensor.type, sensor)" class="home-members__icon" />
          <span class="flex-1 min-w-0 truncate text-sm text-color">{{ sensor.displayName.value }}</span>
          <Button
            text
            rounded
            severity="secondary"
            class="cui-icon-md"
            :aria-label="t('views.home_dashboard.group_take_out', { name: sensor.displayName.value })"
            @click="emit('take', sensor.id)"
          >
            <template #icon>
              <i-mdi:minus />
            </template>
          </Button>
        </li>
      </ul>
    </div>
  </CuiPopoverSheet>
</template>

<script setup lang="ts">
import { sensorIcon } from '@/common/sensorDisplay.js';
import CuiPopoverSheet from '@/components/CuiPopoverSheet/CuiPopoverSheet.vue';

import type { CuiHomeGroupMembersEmits, CuiHomeGroupMembersProps } from './types.js';

defineProps<CuiHomeGroupMembersProps>();
const emit = defineEmits<CuiHomeGroupMembersEmits>();

const { t } = useI18n();

const popoverRef = useTemplateRef<InstanceType<typeof CuiPopoverSheet>>('popoverRef');
</script>

<style scoped>
.home-members {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.home-members__row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.home-members__icon {
  flex-shrink: 0;
  width: 1.125rem;
  height: 1.125rem;
  color: var(--text-secondary-color);
}
</style>
