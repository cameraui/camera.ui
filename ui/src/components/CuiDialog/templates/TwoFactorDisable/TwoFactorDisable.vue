<template>
  <div class="flex flex-col gap-6">
    <p class="text-muted">{{ $t('views.settings.security.disable_confirm') }}</p>

    <div class="flex flex-col gap-2 justify-center items-center mt-5">
      <label class="cui-label">{{ $t('views.settings.security.enter_code') }}</label>
      <InputOtp v-model="code" :length="6" integer-only class="justify-center" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { AuthQuery } from '@/api/routes/auth.js';

import type { DialogRefProps } from '@/composables/useCuiDialog.js';

const authQuery = new AuthQuery();

const toast = useCuiToast();
const { t } = useI18n();
const dialogRefProps = inject<DialogRefProps>('dialogRefProps')!;

const { mutateAsync: disable2FAFn, isPending: disableLoading } = authQuery.disable2FAQuery();

const code = ref('');

const isLoading = computed(() => Boolean(dialogRefProps.loading?.value || disableLoading.value));
const isDisabled = computed(() => code.value.length < 6);

async function onConfirm(): Promise<void | null> {
  if (code.value.length < 6) {
    return null;
  }

  try {
    await disable2FAFn({ code: code.value });
    toast.add({ severity: 'success', detail: t('views.settings.security.2fa_disabled_success'), life: 3000 });
  } catch (error: any) {
    toast.add({ severity: 'error', detail: error, life: 3000 });
    return null;
  }
}

defineExpose({
  isLoading,
  isDisabled,
  onConfirm,
});
</script>
