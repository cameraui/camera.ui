<template>
  <Button v-tooltip.top="{ value: tooltip }" severity="secondary" text rounded class="cui-icon-md" @click="openOAuthDialog">
    <template #icon>
      <i-mdi:cloud-check v-if="state.status === 'connected'" class="text-green-500" width="100%" height="100%" />
      <ProgressSpinner v-else-if="authorizing" class="w-5 h-5 m-0" stroke-width="6" />
      <i-mdi:cloud-alert v-else-if="state.status === 'error'" class="text-red-500" width="100%" height="100%" />
      <i-mdi:cloud-outline v-else width="100%" height="100%" />
    </template>
  </Button>
</template>

<script setup lang="ts">
import { useOAuth } from '@camera.ui/browser';

import { asyncComponent } from '@/common/asyncComponent.js';

import type { OAuthDeviceFlowProps } from '@/components/CuiDialog/templates/OAuthDeviceFlow/types.js';
import type { CuiPluginOAuthButtonProps } from './types.js';

const OAuthDeviceFlowDialog = asyncComponent(() => import('@/components/CuiDialog/templates/OAuthDeviceFlow/OAuthDeviceFlow.vue'));

const props = defineProps<CuiPluginOAuthButtonProps>();

const dialog = useCuiDialog();
const router = useRouter();
const { t } = useI18n();
const { state } = useOAuth(props.pluginName);
const { isPairing } = useServerPairing();

const authorizing = computed(() => isPairing.value || state.value.status === 'awaiting_user' || state.value.status === 'polling');
const tooltip = computed(() => {
  if (state.value.status === 'connected') return t('components.oauth.tooltip_connected', { email: state.value.userEmail || '—' });
  if (authorizing.value) return t('components.oauth.tooltip_authorizing');
  if (state.value.status === 'error') return t('components.oauth.tooltip_error');
  return t('components.oauth.tooltip_connect');
});

function openOAuthDialog() {
  if (props.routeTo) {
    router.push(props.routeTo);
    return;
  }

  dialog.openComponentDialog<OAuthDeviceFlowProps>(OAuthDeviceFlowDialog, {
    data: {
      title: t('components.oauth.dialog_title'),
      stayActive: true,
      hideConfirmButton: authorizing,
      confirmText: computed(() => (state.value.status === 'connected' ? t('components.oauth.disconnect') : t('components.oauth.connect'))),
      cancelText: computed(() => (state.value.status === 'connected' ? t('components.form.button.close') : t('components.form.button.cancel'))),
      contentProps: {
        pluginName: props.pluginName,
      },
    },
  });
}
</script>

<style scoped></style>
