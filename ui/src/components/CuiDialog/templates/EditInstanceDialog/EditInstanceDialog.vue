<template>
  <div class="flex flex-col gap-6 w-full">
    <div class="flex flex-col field-gap">
      <label for="instanceName" class="cui-label">{{ $t('views.settings.instances.name') }}</label>
      <InputText id="instanceName" v-model="name" :placeholder="$t('views.settings.instances.name')" class="w-full" autofocus />
    </div>
    <div class="flex flex-col field-gap">
      <label for="instanceUrl" class="cui-label">{{ $t('views.settings.instances.url') }}</label>
      <InputText v-if="isAddMode" id="instanceUrl" v-model="url" :placeholder="$t('views.settings.instances.url_placeholder')" class="w-full" />
      <InputText v-else id="instanceUrl" :model-value="currentUrl" class="w-full" readonly />
    </div>
    <div class="flex flex-col field-gap">
      <label for="credUsername" class="cui-label">{{ $t('views.settings.instances.credentials_username') }}</label>
      <InputText
        id="credUsername"
        v-model="credUsername"
        :placeholder="hasExistingCredentials ? $t('views.settings.instances.credentials_unchanged') : $t('views.settings.instances.credentials_username')"
        class="w-full"
        autocomplete="off"
      />
    </div>
    <div class="flex flex-col field-gap">
      <label for="credPassword" class="cui-label">{{ $t('views.settings.instances.credentials_password') }}</label>
      <InputText
        id="credPassword"
        v-model="credPassword"
        type="password"
        :placeholder="hasExistingCredentials ? $t('views.settings.instances.credentials_unchanged') : $t('views.settings.instances.credentials_password')"
        class="w-full"
        autocomplete="new-password"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CustomDialogComponent } from '@/composables/useCuiDialog.js';

import type { EditInstanceDialogProps } from '@/components/CuiInstanceSwitcher/types.js';

const props = defineProps<EditInstanceDialogProps>();

const { t } = useI18n();
const toast = useCuiToast();

const name = ref(props.currentName);
const url = ref(props.currentUrl ?? '');
const credUsername = ref('');
const credPassword = ref('');

const isAddMode = computed(() => !props.currentName);
const hasExistingCredentials = computed(() => !!props.hasCredentials);

defineExpose<CustomDialogComponent>({
  onConfirm: async () => {
    const trimmedName = name.value.trim();
    if (!trimmedName) return null;

    if (isAddMode.value) {
      const trimmedUrl = url.value.trim();
      if (!trimmedUrl) return null;

      const trimmedUsername = credUsername.value.trim();
      if (!trimmedUsername || !credPassword.value) {
        toast.add({ severity: 'warn', detail: t('views.settings.instances.credentials_required'), life: 3000 });
        return null;
      }

      return {
        name: trimmedName,
        url: trimmedUrl,
        credentials: { username: trimmedUsername, password: credPassword.value },
      };
    }

    const credentials = credUsername.value.trim() && credPassword.value ? { username: credUsername.value.trim(), password: credPassword.value } : undefined;

    return { name: trimmedName, credentials };
  },
});
</script>
