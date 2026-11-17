<template>
  <div class="flex flex-col">
    <Transition name="fade" mode="out-in">
      <div v-if="isPairing" key="pairing" class="flex flex-col gap-4">
        <Message severity="secondary" variant="simple" size="small">{{ $t('components.oauth.register_server_first') }}</Message>
        <CuiServerPairing stacked />
      </div>

      <div v-else-if="state.status === 'disconnected'" key="intro" class="flex flex-col gap-4">
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

        <div class="flex flex-col items-center gap-2 w-full max-w-sm">
          <span class="text-sm text-muted">{{ $t('components.oauth.enter_code_at') }}</span>
          <InputGroup>
            <InputText :model-value="state.verificationUri" readonly class="font-mono text-sm" />
            <CuiCopyAddon :value="verificationLink" />
            <InputGroupAddon>
              <Button v-tooltip="{ value: $t('components.form.button.open_in_browser') }" type="button" severity="secondary" text @click="onOpenLink">
                <template #icon>
                  <OpenIcon />
                </template>
              </Button>
            </InputGroupAddon>
          </InputGroup>
          <InputGroup>
            <InputText :model-value="state.userCode" readonly class="font-mono text-lg text-center tracking-widest" />
            <CuiCopyAddon :value="state.userCode" />
          </InputGroup>
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
        <span class="text-sm">{{ errorText(state.errorCode, state.errorMessage) }}</span>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { useOAuth } from '@camera.ui/browser';
import OpenIcon from '~icons/fluent/open16-filled';

import type { CustomDialogComponent } from '@/composables/useCuiDialog.js';
import type { OAuthDeviceFlowProps } from './types.js';

const props = defineProps<OAuthDeviceFlowProps>();

const { t } = useI18n();
const toast = useCuiToast();
const { state, metadata, startDeviceFlow, disconnect, cancel, refresh } = useOAuth(props.pluginName);
const { isPairing, start: startPairing, cancel: cancelPairing } = useServerPairing();

const requestedScopes = computed(() => Object.keys(metadata.value?.scopeDescriptions ?? {}));
const verificationLink = computed(() => state.value.verificationUriComplete || state.value.verificationUri);

function onOpenLink() {
  if (verificationLink.value) window.open(verificationLink.value, '_blank', 'noopener');
}

function errorText(code?: string, message?: string): string {
  switch (code) {
    case 'access_denied':
      return t('components.oauth.error_access_denied');
    case 'expired_token':
      return t('components.oauth.error_expired');
    case 'server_not_paired':
      return t('components.oauth.error_server_not_paired');
    default:
      return message || t('components.oauth.error_generic');
  }
}

async function connect(registerFirst: boolean): Promise<void> {
  try {
    await startDeviceFlow(requestedScopes.value);
  } catch (err) {
    await refresh();
    if (!registerFirst || state.value.errorCode !== 'server_not_paired') throw err;
    await startPairing(undefined, () => {
      connect(false).catch((error) => toast.add({ severity: 'error', detail: error, life: 3000 }));
    });
  }
}

async function onConfirm(): Promise<null> {
  if (state.value.status === 'disconnected' || state.value.status === 'error') {
    await connect(true);
  } else if (state.value.status === 'connected') {
    await disconnect();
  }
  // keep the dialog open, the shared poll shows the progress
  return null;
}

async function onCancel(): Promise<void> {
  cancelPairing();
  if (state.value.status === 'awaiting_user' || state.value.status === 'polling') {
    await cancel();
  }
}

onBeforeUnmount(cancelPairing);

defineExpose<CustomDialogComponent>({
  onConfirm,
  onCancel,
});
</script>

<style scoped></style>
