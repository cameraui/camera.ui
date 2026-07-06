<template>
  <div class="flex flex-col gap-6">
    <p class="text-muted">{{ $t('views.settings.security.regenerate_confirm') }}</p>

    <div class="flex flex-col gap-2 justify-center items-center mt-5">
      <label class="cui-label">{{ $t('views.settings.security.enter_code') }}</label>
      <InputOtp v-model="code" :length="6" integer-only class="justify-center" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { AuthQuery } from '@/api/routes/auth.js';

import type { DialogRefProps } from '@/composables/useCuiDialog.js';
import type { TwoFactorRegenerateProps } from './types.js';

const authQuery = new AuthQuery();

const props = defineProps<TwoFactorRegenerateProps>();

const toast = useCuiToast();
const { t } = useI18n();
const dialogRefProps = inject<DialogRefProps>('dialogRefProps')!;

const { mutateAsync: regenerateBackupCodesFn, isPending: regenerateLoading } = authQuery.regenerateBackupCodesQuery();

const code = ref('');

const isLoading = computed(() => Boolean(dialogRefProps.loading?.value || regenerateLoading.value));
const isDisabled = computed(() => code.value.length < 6);

async function onConfirm(): Promise<void | null> {
  if (code.value.length < 6) {
    return null;
  }

  try {
    const response = await regenerateBackupCodesFn({ code: code.value });
    toast.add({ severity: 'success', detail: t('views.settings.security.backup_regenerated'), life: 3000 });

    if (props.onBackupCodesGenerated) {
      props.onBackupCodesGenerated(response.backupCodes);
    }
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
