import { extractErrorMessage } from '@/common/utils.js';

import type { CuiToastDismissEvent, CuiToastMessage } from '@/components/CuiToast/types.js';

export const cuiToastBus = useEventBus<CuiToastMessage | CuiToastDismissEvent>('cui-toast');

function isErrorMessage(detail: string | Error | unknown): detail is Error {
  return detail instanceof Error;
}

export function useCuiToast() {
  const log = useLogger();

  const add = (message: CuiToastMessage) => {
    if (message.detail === '') {
      message.detail = undefined;
    }

    if (message.severity === 'error' && message.detail) {
      log.error('Error detail:', message.detail);
    }

    cuiToastBus.emit({
      ...message,
      detail: isErrorMessage(message.detail) ? extractErrorMessage(message.detail) : message.detail,
    });
  };

  const dismiss = (id: string) => {
    cuiToastBus.emit({ type: 'dismiss', id });
  };

  return { add, dismiss };
}
