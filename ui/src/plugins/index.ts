import { VueQueryPlugin } from '@tanstack/vue-query';
import PrimeVue from 'openvue/config';
import FocusTrap from 'openvue/focustrap';
import { ViewTransitionsPlugin } from 'vue-view-transitions';

import { isCancellationError, isNoTargetError } from '@/common/utils.js';
import { isRestoreActive } from '@/composables/useBackupRestore.js';
import { restarting } from '@/composables/useServerRestart.js';
import { i18n } from '@/i18n/index.js';
import Pinia from '@/stores/index.js';
import { setupOpenvueStyles } from './openvueStyles.js';
import CameraUiPreset from './preset.js';
import { tooltip } from './tooltip.js';

import type { VueQueryPluginOptions } from '@tanstack/vue-query';
import type { App } from 'vue';

function surfaceQueryFailure(error: unknown): void {
  if (isCancellationError(error)) return;
  if (isRestoreActive.value || restarting.value) return;
  const toast = useCuiToast();
  toast.add({ severity: 'error', detail: error, life: 3000 });
}

function surfaceMutationFailure(error: unknown): void {
  if (isNoTargetError(error) && !isRestoreActive.value && !restarting.value) {
    useCuiToast().add({ severity: 'error', detail: i18n.global.t('connection.not_connected'), life: 3000 });
    return;
  }
  surfaceQueryFailure(error);
}

function buildVueQueryOptions(): VueQueryPluginOptions {
  return {
    enableDevtoolsV6Plugin: true,
    queryClientConfig: {
      defaultOptions: {
        queries: {
          refetchOnWindowFocus: false,
          refetchOnReconnect: true,
          gcTime: 5 * 60 * 1000,
          staleTime: 10_000,
          networkMode: 'online',
          retry: (failureCount, error: unknown) => {
            const status = extractStatus(error);
            // the transport's tokenLifecycle retries 401s itself
            if (status === 401) return false;
            const willRetry = failureCount < 2;
            if (willRetry) return true;
            surfaceQueryFailure(error);
            return false;
          },
        },
        mutations: {
          retry: 0,
          networkMode: 'always',
          onError: surfaceMutationFailure,
        },
      },
    },
  };
}

function extractStatus(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { status?: number } }).response;
    if (typeof response?.status === 'number') return response.status;
  }
  return undefined;
}

function buildPrimeVueOptions() {
  return {
    theme: {
      preset: CameraUiPreset,
      options: {
        cssLayer: {
          name: 'primevue',
          order: 'theme, base, primevue',
        },
        darkModeSelector: '.dark-mode',
      },
    },
    pt: {
      inputotp: { pcInputText: { root: { autocomplete: 'one-time-code' } } },
      multiselect: { hiddenInput: { type: 'button' } },
    },
  };
}

export function registerUiPlugins(app: App): void {
  app.directive('tooltip', tooltip).directive('focustrap', FocusTrap);

  app.use(PrimeVue, buildPrimeVueOptions()).use(i18n).use(ViewTransitionsPlugin()).use(VueQueryPlugin, buildVueQueryOptions()).use(Pinia);
  // the primevue install drops every theme listener, so this comes after it
  setupOpenvueStyles();
}
