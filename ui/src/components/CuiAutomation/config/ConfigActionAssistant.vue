<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.assistant_user') }}</label>
      <Select :model-value="data.user" :options="userOptions" option-label="label" option-value="value" class="w-full" @update:model-value="onUserChange" />
      <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ t('components.automation_nodes.assistant_user_hint') }}</Message>
    </div>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.assistant_profile') }}</label>
      <Select
        :model-value="data.profileId ?? null"
        :options="profiles ?? []"
        option-label="name"
        option-value="_id"
        show-clear
        class="w-full"
        :disabled="!data.user"
        :placeholder="t('components.automation_nodes.assistant_profile_none')"
        @update:model-value="update('profileId', $event ?? undefined)"
      />
      <Message v-if="profileMissing" severity="warn" variant="simple" size="small" class="cui-input-hint">{{
        t('components.automation_nodes.assistant_profile_missing')
      }}</Message>
      <Message v-else severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ t('components.automation_nodes.assistant_profile_hint') }}</Message>
    </div>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.assistant_prompt') }}</label>
      <Textarea
        :model-value="data.prompt"
        :placeholder="t('components.automation_nodes.assistant_prompt_placeholder')"
        rows="4"
        class="w-full"
        @update:model-value="update('prompt', $event)"
      />
      <VariableSuggestions :variables="availableVars" @select="insertInto('prompt', $event)" />
      <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ t('components.automation_nodes.assistant_prompt_hint') }}</Message>
    </div>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.assistant_image') }}</label>
      <VariableInput :model-value="data.image ?? ''" :node-id="nodeId" placeholder="{{snapshot.base64}}" @update:model-value="update('image', $event)" />
      <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ t('components.automation_nodes.assistant_image_hint') }}</Message>
    </div>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.assistant_deliver') }}</label>
      <Select
        :model-value="data.deliver ?? 'push'"
        :options="deliverOptions"
        option-label="label"
        option-value="value"
        class="w-full"
        @update:model-value="update('deliver', $event)"
      />
    </div>

    <div v-if="data.deliver !== 'none'" class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.assistant_title') }}</label>
      <InputText :model-value="data.title" :placeholder="t('components.automation_nodes.assistant_title_placeholder')" @update:model-value="update('title', $event)" />
      <VariableSuggestions :variables="availableVars" @select="insertInto('title', $event)" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { AssistantQuery } from '@/api/routes/assistant.js';
import { useFlowVariables } from './flowSchema.js';
import { useUserOptions } from './useUserOptions.js';
import VariableInput from './VariableInput.vue';
import VariableSuggestions from './VariableSuggestions.vue';

import type { ConfigActionAssistantProps, ConfigNodeUpdateEmits } from '../types.js';

const assistantQuery = new AssistantQuery();

const props = defineProps<ConfigActionAssistantProps>();
const emit = defineEmits<ConfigNodeUpdateEmits>();

const { t } = useI18n();
const { userOptions } = useUserOptions();

const { data: profiles, isFetched: profilesFetched } = assistantQuery.listProfilesOfQuery(computed(() => props.data.user || undefined));

const deliverOptions = [
  { label: t('components.automation_nodes.assistant_deliver_push'), value: 'push' },
  { label: t('components.automation_nodes.assistant_deliver_thread'), value: 'thread' },
  { label: t('components.automation_nodes.assistant_deliver_both'), value: 'both' },
  { label: t('components.automation_nodes.assistant_deliver_none'), value: 'none' },
];

const { options: availableVars } = useFlowVariables(() => props.nodeId);

const profileMissing = computed(() => Boolean(props.data.profileId) && profilesFetched.value && !profiles.value?.some((profile) => profile._id === props.data.profileId));

function insertInto(field: 'prompt' | 'title', variable: string): void {
  const current = (props.data[field] as string) ?? '';
  emit('update:data', { [field]: current + variable });
}

function onUserChange(user: string): void {
  emit('update:data', { user, profileId: undefined });
}

function update(field: string, value: unknown): void {
  emit('update:data', { [field]: value });
}
</script>
