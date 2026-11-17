import { pluginMessageResponseTypeToToastType } from '@/common/utils.js';

import type { FormSubmitResponse } from '@camera.ui/sdk';

export function useSubmitResponse() {
  const router = useRouter();
  const toast = useCuiToast();

  function showSubmitResponse(response: FormSubmitResponse | void): void {
    if (response?.toast) {
      toast.add({ severity: pluginMessageResponseTypeToToastType(response.toast.type), detail: response.toast.message, life: 3000 });
    }
    if (response?.open) router.openLink(response.open);
  }

  return { showSubmitResponse };
}
