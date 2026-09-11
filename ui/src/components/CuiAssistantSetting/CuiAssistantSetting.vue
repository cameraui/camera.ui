<template>
  <CuiAssistantNotice
    :severity="enabled ? 'success' : 'warn'"
    :title="$t(`views.assistant.setting_${setting}_title`)"
    :text="enabled ? $t('views.assistant.setting_on') : $t(isAdmin ? `views.assistant.setting_${setting}_off` : 'views.assistant.setting_needs_admin')"
  >
    <ToggleSwitch v-if="isAdmin" :model-value="enabled" :disabled="patchMutation.isPending.value" class="shrink-0" @update:model-value="toggle" />
  </CuiAssistantNotice>
</template>

<script setup lang="ts">
import { AssistantQuery } from '@/api/routes/assistant.js';
import { defaultModel, modelInput } from '@/common/assistantModels.js';

import type { CuiAssistantSettingProps } from './types.js';

const assistantQuery = new AssistantQuery();

const props = defineProps<CuiAssistantSettingProps>();

const authStore = useAuthStore();
const { user } = storeToRefs(authStore);

const { data: info } = assistantQuery.getAssistantInfoQuery();
const patchMutation = assistantQuery.patchAssistantInfoMutation();

const isAdmin = computed(() => user.value?.role === 'admin' || user.value?.role === 'master');
const models = computed(() => info.value?.settings.models ?? []);
const model = computed(() => models.value.find((entry) => entry._id === props.modelId) ?? (info.value ? defaultModel(info.value.settings) : undefined));
const enabled = computed(() => (props.setting === 'sendImages' ? model.value?.sendImages === true : info.value?.settings[props.setting] === true));

async function toggle(value: boolean): Promise<void> {
  if (props.setting !== 'sendImages') {
    await patchMutation.mutateAsync({ [props.setting]: value });
    return;
  }
  const target = model.value;
  if (!target) return;
  await patchMutation.mutateAsync({ models: models.value.map((entry) => ({ ...modelInput(entry), ...(entry._id === target._id ? { sendImages: value } : {}) })) });
}
</script>
