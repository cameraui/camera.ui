<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ $t('components.form.label.username') }}</label>
      <InputGroup>
        <InputText v-model.trim="username" :loading="isLoading" type="text" />
      </InputGroup>
    </div>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ $t('components.form.label.current_password') }}</label>
      <InputGroup>
        <Password v-model="currentPassword" :loading="isLoading" :feedback="false" toggle-mask />
      </InputGroup>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { DialogRefProps } from '@/composables/useCuiDialog.js';

const toast = useCuiToast();
const { t } = useI18n();
const dialogRefProps = inject<DialogRefProps>('dialogRefProps')!;

const authStore = useAuthStore();

const username = ref(authStore.user?.username ?? '');
const currentPassword = ref('');
const saving = ref(false);

const isLoading = computed(() => Boolean(dialogRefProps.loading?.value || saving.value));
const isDisabled = computed(() => !username.value || username.value === authStore.user?.username || !currentPassword.value);

async function onConfirm(): Promise<void | null> {
  if (isDisabled.value) {
    return null;
  }

  saving.value = true;
  try {
    await authStore.updateUser({ username: username.value, currentPassword: currentPassword.value });
    toast.add({ severity: 'success', detail: t('components.toast.profile_updated'), life: 3000 });
    authStore.logout();
  } catch {
    // the mutation already shows the error
    return null;
  } finally {
    saving.value = false;
  }
}

defineExpose({
  isLoading,
  isDisabled,
  onConfirm,
});
</script>
