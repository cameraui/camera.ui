import { VueQueryPlugin } from '@tanstack/vue-query';
import PrimeVue from 'primevue/config';
import ConfirmationService from 'primevue/confirmationservice';
import DialogService from 'primevue/dialogservice';
import FocusTrap from 'primevue/focustrap';
import ToastService from 'primevue/toastservice';
import Tooltip from 'primevue/tooltip';
import { ViewTransitionsPlugin } from 'vue-view-transitions';

import { isCancellationError } from '@/common/utils.js';
import { i18n } from '@/i18n/index.js';
import Pinia from '@/stores/index.js';
import CameraUiPreset from './preset.js';

import type { VueQueryPluginOptions } from '@tanstack/vue-query';
import type { App } from 'vue';

function surfaceQueryFailure(error: unknown): void {
  if (isCancellationError(error)) return;
  const toast = useCuiToast();
  toast.add({ severity: 'error', detail: error, life: 3000 });
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
            // 401 will be retried by the HTTP transport's tokenLifecycle —
            // tanstack shouldn't retry on its own. Other failures retry up
            // to 2x silently, then surface.
            if (status === 401) return false;
            const willRetry = failureCount < 2;
            if (willRetry) return true;
            surfaceQueryFailure(error);
            return false;
          },
        },
        mutations: {
          retry: 0,
          networkMode: 'online',
          onError: surfaceQueryFailure,
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
  };
}

export function registerUiPlugins(app: App): void {
  app.directive('tooltip', Tooltip).directive('focustrap', FocusTrap);

  app
    .use(ToastService)
    .use(ConfirmationService)
    .use(DialogService)
    .use(PrimeVue, buildPrimeVueOptions())
    .use(i18n)
    .use(ViewTransitionsPlugin())
    .use(VueQueryPlugin, buildVueQueryOptions())
    .use(Pinia);
}
