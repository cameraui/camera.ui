<template>
  <div class="flex flex-col">
    <Transition name="fade" mode="out-in">
      <div v-if="state.status === 'disconnected'" key="intro" class="flex flex-col gap-4">
        <Message severity="secondary" variant="simple" size="small">
          {{ $t('components.oauth.intro', { idp: metadata?.idpDisplayName ?? 'cameraui.com' }) }}
        </Message>

        <ul v-if="requestedScopes.length" class="flex flex-col gap-1.5 list-disc pl-5 text-sm text-muted">
          <li v-for="scope in requestedScopes" :key="scope">
            {{ metadata?.scopeDescriptions[scope] ?? scope }}
          </li>
        </ul>
      </div>

      <div v-else-if="state.status === 'awaiting_user' || state.status === 'polling'" key="awaiting" class="flex flex-col items-center gap-5 text-center">
        <CuiQRCode v-if="state.verificationUriComplete" :value="state.verificationUriComplete" :size="184" :logo-size="36" />

        <div class="flex flex-col items-center gap-2">
          <span class="text-sm text-muted">{{ $t('components.oauth.enter_code_at') }}</span>
          <div class="flex items-center gap-1 max-w-full min-w-0">
            <a
              :href="state.verificationUriComplete || state.verificationUri"
              target="_blank"
              rel="noopener"
              class="text-sm font-mono text-primary hover:underline break-all select-text"
              >{{ state.verificationUri }}</a
            >
            <CuiActionButton
              :action-text="$t('components.form.tooltip.copied')"
              :icon="CopyIcon"
              :button-props="{ severity: 'secondary', text: true, size: 'small' }"
              @action="onCopyLink"
            />
          </div>
          <div class="mt-1 flex items-center gap-1">
            <div class="card-background border border-color rounded-xl px-6 py-3">
              <span class="text-2xl font-mono font-semibold tracking-[0.25em] select-text">{{ state.userCode }}</span>
            </div>
            <CuiActionButton
              :action-text="$t('components.form.tooltip.copied')"
              :icon="CopyIcon"
              :button-props="{ severity: 'secondary', text: true, size: 'small' }"
              @action="onCopyCode"
            />
          </div>
        </div>

        <div class="flex items-center gap-2 text-muted">
          <ProgressSpinner class="w-4 h-4 m-0" stroke-width="5" />
          <span class="text-sm">{{ $t('components.oauth.waiting') }}</span>
        </div>
      </div>

      <div v-else-if="state.status === 'connected'" key="connected" class="flex flex-col items-center gap-3 py-2 text-center">
        <i-mdi:cloud-check class="text-green-500 w-10 h-10" />
        <span class="text-sm">{{ $t('components.oauth.connected_as', { email: state.userEmail || '—' }) }}</span>
      </div>

      <div v-else-if="state.status === 'error'" key="error" class="flex flex-col items-center gap-3 py-2 text-center">
        <i-mdi:cloud-alert class="text-red-500 w-10 h-10" />
        <span class="text-sm">{{ state.errorMessage || errorText(state.errorCode) }}</span>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { useOAuth } from '@camera.ui/browser';
import CopyIcon from '~icons/fluent/copy-16-filled';

import { copyToClipboard } from '@/common/utils.js';

import type { CustomDialogComponent } from '@/composables/useCuiDialog.js';
import type { OAuthDeviceFlowProps } from './types.js';

const props = defineProps<OAuthDeviceFlowProps>();

const { t } = useI18n();
const { state, metadata, startDeviceFlow, disconnect, cancel } = useOAuth(props.pluginName);
const requestedScopes = computed(() => Object.keys(metadata.value?.scopeDescriptions ?? {}));

function onCopyLink() {
  const uri = state.value.verificationUriComplete || state.value.verificationUri;
  if (uri) copyToClipboard(uri);
}

function onCopyCode() {
  if (state.value.userCode) copyToClipboard(state.value.userCode);
}

function errorText(code?: string): string {
  switch (code) {
    case 'access_denied':
      return t('components.oauth.error_access_denied');
    case 'expired_token':
      return t('components.oauth.error_expired');
    default:
      return t('components.oauth.error_generic');
  }
}

async function onConfirm(): Promise<null> {
  if (state.value.status === 'disconnected' || state.value.status === 'error') {
    await startDeviceFlow(requestedScopes.value);
  } else if (state.value.status === 'connected') {
    await disconnect();
  }
  // Always keep the dialog open — progress is reflected via the shared poll.
  return null;
}

async function onCancel(): Promise<void> {
  if (state.value.status === 'awaiting_user' || state.value.status === 'polling') {
    await cancel();
  }
}

defineExpose<CustomDialogComponent>({
  onConfirm,
  onCancel,
});
</script>

<style scoped></style>
