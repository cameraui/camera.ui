<template>
  <Message :severity="enabled ? 'success' : 'warn'" size="small" class="cui-assistant-setting">
    <div class="flex items-center gap-3">
      <div class="flex min-w-0 flex-1 flex-col">
        <span class="text-sm font-medium">{{ $t(`views.assistant.setting_${setting}_title`) }}</span>
        <span class="text-xs">{{
          enabled ? $t('views.assistant.setting_on') : $t(isAdmin ? `views.assistant.setting_${setting}_off` : 'views.assistant.setting_needs_admin')
        }}</span>
      </div>
      <ToggleSwitch v-if="isAdmin" :model-value="enabled" :disabled="patchMutation.isPending.value" class="shrink-0" @update:model-value="toggle" />
    </div>
  </Message>
</template>

<script setup lang="ts">
import { AssistantQuery } from '@/api/routes/assistant.js';

import type { CuiAssistantSettingProps } from './types.js';

const assistantQuery = new AssistantQuery();

const props = defineProps<CuiAssistantSettingProps>();

const authStore = useAuthStore();
const { user } = storeToRefs(authStore);

const { data: info } = assistantQuery.getAssistantInfoQuery();
const patchMutation = assistantQuery.patchAssistantInfoMutation();

const isAdmin = computed(() => user.value?.role === 'admin' || user.value?.role === 'master');
const enabled = computed(() => info.value?.settings[props.setting] === true);

async function toggle(value: boolean): Promise<void> {
  await patchMutation.mutateAsync({ [props.setting]: value });
}
</script>

<style scoped>
.cui-assistant-setting :deep(.p-message-text) {
  width: 100%;
}
</style>
