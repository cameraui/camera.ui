<template>
  <CuiFloatingButtonGroup v-if="!editing && !kiosk" side="left">
    <CuiHomeProfileMenu v-bind="profile" floating />
  </CuiFloatingButtonGroup>
  <CuiFloatingButtonGroup :force-visible="editing">
    <template v-if="editing">
      <CuiFloatingButton
        v-if="arrangeable"
        :tooltip-props="{ value: t('views.home_dashboard.arrange_hint') }"
        :button-props="{ severity: 'secondary', disabled: saving }"
        :icon="ArrangeIcon"
        :icon-props="{ width: '100%', height: '100%' }"
        @click="emit('arrange')"
      />
      <CuiFloatingButton
        :tooltip-props="{ value: t('components.form.button.cancel') }"
        :button-props="{ severity: 'secondary', disabled: saving }"
        :icon="CloseIcon"
        :icon-props="{ width: '100%', height: '100%' }"
        @click="emit('cancel')"
      />
      <CuiFloatingButton
        :tooltip-props="{ value: t('views.home_dashboard.widgets') }"
        :button-props="{ severity: 'success', disabled: saving, 'aria-expanded': panelOpen }"
        :icon="PlusIcon"
        :icon-props="{ width: '100%', height: '100%' }"
        @click="emit('panel')"
      />
      <CuiFloatingButton
        :tooltip-props="{ value: t('views.home_dashboard.done') }"
        :button-props="{ loading: saving }"
        :icon="CheckIcon"
        :icon-props="{ width: '100%', height: '100%' }"
        @click="emit('done')"
      />
    </template>
    <template v-else>
      <CuiFloatingButton
        :tooltip-props="{ value: t(kiosk ? 'views.home_dashboard.kiosk_exit' : 'views.home_dashboard.kiosk') }"
        :button-props="{ severity: 'secondary' }"
        :icon="kiosk ? FullscreenExitIcon : FullscreenIcon"
        :icon-props="{ width: '100%', height: '100%' }"
        @click="kiosk = !kiosk"
      />
      <CuiFloatingButton
        v-if="!kiosk"
        :tooltip-props="{ value: t('views.home_dashboard.edit') }"
        :button-props="{ severity: 'secondary' }"
        :icon="PencilIcon"
        :icon-props="{ width: '100%', height: '100%' }"
        @click="emit('edit')"
      />
    </template>
  </CuiFloatingButtonGroup>
</template>

<script setup lang="ts">
import ArrangeIcon from '~icons/mdi/auto-fix';
import CheckIcon from '~icons/mdi/check';
import CloseIcon from '~icons/mdi/close';
import FullscreenIcon from '~icons/mdi/fullscreen';
import FullscreenExitIcon from '~icons/mdi/fullscreen-exit';
import PencilIcon from '~icons/mdi/pencil-outline';
import PlusIcon from '~icons/mdi/plus';

import CuiHomeProfileMenu from './CuiHomeProfileMenu.vue';

import type { CuiHomeActionsEmits, CuiHomeActionsProps } from './types.js';

defineProps<CuiHomeActionsProps>();
const emit = defineEmits<CuiHomeActionsEmits>();

const { t } = useI18n();
const { enabled: kiosk } = useKioskMode();
</script>
