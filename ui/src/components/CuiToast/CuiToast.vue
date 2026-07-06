<template>
  <Toaster rich-colors :position="mdBreakpoint ? 'top-center' : 'bottom-right'" :visible-toasts="3" :theme="theme" />
</template>

<script setup lang="ts">
import { Toaster, toast } from 'vue-sonner';

import type { CuiToastDismissEvent, CuiToastMessage, CuiToastSeverity } from './types.js';

const log = useLogger();
const { t } = useI18n();
const { mdBreakpoint } = useSharedCuiBreakpoint();

const themeStore = useThemeStore();
const { theme } = storeToRefs(themeStore);

const severityMap = {
  success: toast.success,
  error: toast.error,
  warn: toast.warning,
  warning: toast.warning,
  info: toast.info,
} as const;

function getDefaultTitle(severity: CuiToastSeverity): string {
  const key = severity === 'warning' ? 'warn' : severity;
  return t(`components.toast.title_${key}`);
}

function isDismissEvent(payload: CuiToastMessage | CuiToastDismissEvent): payload is CuiToastDismissEvent {
  return (payload as CuiToastDismissEvent).type === 'dismiss';
}

const stopBus = cuiToastBus.on((payload: CuiToastMessage | CuiToastDismissEvent) => {
  if (isDismissEvent(payload)) {
    toast.dismiss(payload.id);
    return;
  }

  const message = payload;
  const toastFn = severityMap[message.severity] || toast;
  const title = message.summary || getDefaultTitle(message.severity);

  let actionConfig: { label: string; onClick: (e: MouseEvent) => void } | undefined;
  if (message.action) {
    const { label, loadingLabel, onClick } = message.action;
    const id = message.id;
    actionConfig = {
      label,
      onClick: (e: MouseEvent) => {
        // Don't auto-dismiss on click — caller controls the lifecycle.
        e.preventDefault();
        e.stopPropagation();
        const result = onClick();
        if (result instanceof Promise && id) {
          toast.loading(loadingLabel ?? label, { id, duration: Number.POSITIVE_INFINITY });
          result.catch((err) => {
            log.error('action failed', err);
            toast.error(t('components.toast.title_error'), { id });
          });
        }
      },
    };
  }

  toastFn(title, {
    id: message.id,
    description: message.detail as string | undefined,
    duration: message.persistent ? Number.POSITIVE_INFINITY : (message.life ?? 3000),
    action: actionConfig,
  });
});

tryOnScopeDispose(stopBus);
</script>
