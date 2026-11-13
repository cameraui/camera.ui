<template>
  <div class="flex flex-col gap-6">
    <p class="text-muted">{{ $t('views.settings.security.setup_confirm') }}</p>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ $t('components.form.label.current_password') }}</label>
      <InputGroup>
        <Password v-model="currentPassword" :feedback="false" toggle-mask />
      </InputGroup>
    </div>
  </div>
</template>

<script setup lang="ts">
import { AuthQuery } from '@/api/routes/auth.js';

import type { DialogRefProps } from '@/composables/useCuiDialog.js';
import type { TwoFactorSetupProps } from './types.js';

const authQuery = new AuthQuery();

const props = defineProps<TwoFactorSetupProps>();

const toast = useCuiToast();
const dialogRefProps = inject<DialogRefProps>('dialogRefProps')!;

const { mutateAsync: setup2FAFn, isPending: setupLoading } = authQuery.setup2FAQuery();

const currentPassword = ref('');

const isLoading = computed(() => Boolean(dialogRefProps.loading?.value || setupLoading.value));
const isDisabled = computed(() => !currentPassword.value);

async function onConfirm(): Promise<void | null> {
  if (!currentPassword.value) {
    return null;
  }

  try {
    const response = await setup2FAFn({ currentPassword: currentPassword.value });
    props.onSetup(response.secret);
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
