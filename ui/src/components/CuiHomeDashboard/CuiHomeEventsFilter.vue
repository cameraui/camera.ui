<template>
  <Button
    v-tooltip.top="label ? undefined : t('components.camera_events.filter')"
    :rounded="!label"
    :size="label ? undefined : 'small'"
    :fluid="!!label"
    :label
    :severity="active ? 'primary' : 'secondary'"
    :aria-label="t('components.camera_events.filter')"
    @click="openFilter"
  >
    <template #icon>
      <i-mage:filter-fill v-if="active" />
      <i-mage:filter v-else />
    </template>
  </Button>
</template>

<script setup lang="ts">
import { asyncComponent } from '@/common/asyncComponent.js';
import { extractErrorMessage } from '@/common/utils.js';

import type { RecentEventsFilterProps } from '@/components/CuiDialog/templates/RecentEventsFilter/types.js';
import type { RecentEventTypes } from '@/composables/useRecentEventTypes.js';
import type { CuiHomeEventsFilterProps } from './types.js';

const RecentEventsFilterDialog = asyncComponent(() => import('@/components/CuiDialog/templates/RecentEventsFilter/RecentEventsFilter.vue'));

const props = defineProps<CuiHomeEventsFilterProps>();

const { t } = useI18n();
const dialog = useCuiDialog();
const toast = useCuiToast();
const { hidden, shown, active, saving, save } = useRecentEventTypes(() => props.cameras);

function openFilter() {
  dialog.openComponentDialog<RecentEventsFilterProps>(RecentEventsFilterDialog, {
    data: {
      title: t('components.camera_events.filter'),
      confirmText: t('components.form.button.save'),
      loading: saving,
      contentProps: { cameras: props.cameras, hidden: hidden.value, shown: shown.value },
    },
    onConfirm: async (next: RecentEventTypes) => {
      try {
        await save(next);
      } catch (error) {
        toast.add({ severity: 'error', detail: extractErrorMessage(error), life: 5000 });
      }
    },
  });
}
</script>
