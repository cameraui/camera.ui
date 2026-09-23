<template>
  <div class="cui-assistant-tray flex w-full flex-col">
    <div class="flex shrink-0 items-center gap-2 px-4 pt-3 pb-2">
      <span class="text-sm font-medium text-color">{{ panel === 'tools' ? $t('views.assistant.tools_title') : $t('views.assistant.memory_title') }}</span>
      <span v-if="panel === 'memory' && memory?.length" class="text-xs tabular-nums text-muted">{{ memory.length }}</span>
      <Button
        type="button"
        severity="secondary"
        text
        rounded
        class="cui-icon-md ml-auto shrink-0"
        :aria-label="$t('components.form.button.close')"
        @click="emit('close')"
      >
        <template #icon>
          <i-mdi:close class="w-4 h-4" />
        </template>
      </Button>
    </div>

    <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
      <template v-if="panel === 'tools'">
        <div class="flex flex-col gap-1.5">
          <label for="assistantInstructions" class="text-xs text-muted">{{ $t('views.assistant.instructions_label') }}</label>
          <Textarea
            id="assistantInstructions"
            v-model="instructions"
            rows="2"
            auto-resize
            class="text-sm"
            :placeholder="$t('views.assistant.instructions_placeholder')"
          />
        </div>

        <div class="flex flex-col gap-1.5">
          <span class="text-xs text-muted">{{ $t('views.assistant.tools_label') }}</span>
          <div class="cui-assistant-options">
            <button
              v-for="group in groups"
              :key="group.id"
              type="button"
              class="cui-assistant-option"
              :class="{ 'cui-assistant-option-on': !disabledGroups.includes(group.id) }"
              @click="toggleGroup(group.id)"
            >
              <span class="cui-assistant-option-mark cui-assistant-option-box"><i-mdi:check class="w-3.5 h-3.5" /></span>
              <span class="min-w-0 flex-1 truncate">{{ group.label }}</span>
              <span class="shrink-0 text-xs text-muted">{{ $t('views.assistant.tools_count', { n: group.count }) }}</span>
            </button>
          </div>
        </div>

        <div v-if="models.length > 1" class="flex flex-col gap-1.5">
          <span class="text-xs text-muted">{{ $t('views.assistant.model_label') }}</span>
          <div class="cui-assistant-options">
            <button
              v-for="option in models"
              :key="option._id"
              type="button"
              class="cui-assistant-option"
              :class="{ 'cui-assistant-option-on': activeModelId === option._id }"
              @click="modelId = option._id"
            >
              <span class="cui-assistant-option-mark"><i-mdi:check class="w-3.5 h-3.5" /></span>
              <span class="min-w-0 flex-1 truncate">{{ option.name }}</span>
              <span class="flex shrink-0 gap-1">
                <Tag
                  v-for="tag in warningTags(option)"
                  :key="tag.key"
                  :severity="tag.severity"
                  :value="$t(`views.settings.assistant_capability_${tag.key}`)"
                  class="text-[10px]"
                />
              </span>
            </button>
          </div>
        </div>

        <div class="flex flex-col gap-1.5">
          <span class="text-xs text-muted">{{ $t('views.assistant.profiles_label') }}</span>
          <div class="cui-assistant-options">
            <button type="button" class="cui-assistant-option" :class="{ 'cui-assistant-option-on': !profileId }" @click="profileId = null">
              <span class="cui-assistant-option-mark"><i-mdi:check class="w-3.5 h-3.5" /></span>
              <span class="min-w-0 flex-1 truncate">{{ $t('views.assistant.profile_none') }}</span>
            </button>
            <button
              v-for="option in profiles ?? []"
              :key="option._id"
              type="button"
              class="cui-assistant-option"
              :class="{ 'cui-assistant-option-on': profileId === option._id }"
              @click="applyProfile(option)"
            >
              <span class="cui-assistant-option-mark"><i-mdi:check class="w-3.5 h-3.5" /></span>
              <span class="min-w-0 flex-1 truncate">{{ option.name }}</span>
              <span class="flex shrink-0 gap-1">
                <Tag
                  v-for="tag in warningTags(profileModel(option))"
                  :key="tag.key"
                  :severity="tag.severity"
                  :value="$t(`views.settings.assistant_capability_${tag.key}`)"
                  class="text-[10px]"
                />
              </span>
            </button>
          </div>
          <div class="flex gap-2">
            <Button
              type="button"
              size="small"
              severity="secondary"
              outlined
              class="flex-1"
              :label="profileId ? $t('views.assistant.profile_update') : $t('views.assistant.profile_save')"
              :loading="createProfileMutation.isPending.value || patchProfileMutation.isPending.value"
              @click="profileId ? updateProfile() : saveAsProfile()"
            />
            <Button
              v-if="profileId"
              type="button"
              size="small"
              severity="secondary"
              outlined
              :label="$t('views.assistant.profile_delete')"
              :loading="deleteProfileMutation.isPending.value"
              @click="deleteProfile"
            />
          </div>
        </div>
      </template>

      <template v-else>
        <div v-if="!memory?.length" class="text-xs text-muted">{{ $t('views.assistant.memory_empty') }}</div>
        <div v-else class="cui-assistant-options">
          <div v-for="fact in memory" :key="fact._id" class="cui-assistant-option">
            <span class="min-w-0 flex-1 leading-snug">{{ fact.text }}</span>
            <Button
              v-tooltip.top="{ value: $t('views.assistant.memory_forget') }"
              type="button"
              severity="secondary"
              text
              rounded
              class="cui-icon-md shrink-0 text-muted"
              :loading="deleteMemoryFactMutation.isPending.value"
              @click="deleteMemoryFactMutation.mutate(fact._id)"
            >
              <template #icon>
                <i-mdi:close class="w-3 h-3" />
              </template>
            </Button>
          </div>
        </div>
        <Button
          v-if="memory?.length"
          type="button"
          size="small"
          severity="secondary"
          outlined
          class="w-full"
          :label="$t('views.assistant.memory_forget_all')"
          :loading="deleteMemoryMutation.isPending.value"
          @click="deleteMemoryMutation.mutate()"
        />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { AssistantQuery } from '@/api/routes/assistant.js';
import { capabilityTags } from '@/common/assistantModels.js';
import AssistantProfileName from '@/components/CuiDialog/templates/AssistantProfileName/AssistantProfileName.vue';

import type { AssistantCapabilityTag } from '@/common/assistantModels.js';
import type { AssistantProfileNameProps } from '@/components/CuiDialog/templates/AssistantProfileName/types.js';
import type { AssistantModelView, DBAssistantProfile } from '@shared/types';
import type { CuiAssistantTrayEmits, CuiAssistantTrayProps } from './types.js';

const assistantQuery = new AssistantQuery();

const props = defineProps<CuiAssistantTrayProps>();

const emit = defineEmits<CuiAssistantTrayEmits>();

const instructions = defineModel<string>('instructions', { required: true });
const disabledGroups = defineModel<string[]>('disabledGroups', { required: true });
const modelId = defineModel<string | null>('modelId', { required: true });
const profileId = defineModel<string | null>('profileId', { required: true });

const { t } = useI18n();
const dialog = useCuiDialog();

const { data: profiles } = assistantQuery.listProfilesQuery();
const createProfileMutation = assistantQuery.createProfileMutation();
const patchProfileMutation = assistantQuery.patchProfileMutation();
const deleteProfileMutation = assistantQuery.deleteProfileMutation();
const { data: memory, refetch: refetchMemory } = assistantQuery.memoryQuery();
const deleteMemoryFactMutation = assistantQuery.deleteMemoryFactMutation();
const deleteMemoryMutation = assistantQuery.deleteMemoryMutation();

const activeModelId = computed(() => (props.models.some((entry) => entry._id === modelId.value) ? modelId.value : props.defaultModelId));

function toggleGroup(id: string): void {
  disabledGroups.value = disabledGroups.value.includes(id) ? disabledGroups.value.filter((entry) => entry !== id) : [...disabledGroups.value, id];
}

function applyProfile(profile: DBAssistantProfile): void {
  profileId.value = profile._id;
  disabledGroups.value = [...profile.disabledGroups];
  instructions.value = profile.instructions;
  modelId.value = props.models.some((entry) => entry._id === profile.modelId) ? profile.modelId : null;
}

function profileModel(profile: DBAssistantProfile): AssistantModelView | undefined {
  return props.models.find((entry) => entry._id === profile.modelId) ?? props.models.find((entry) => entry._id === props.defaultModelId);
}

function warningTags(entry: AssistantModelView | undefined): AssistantCapabilityTag[] {
  return entry ? capabilityTags(entry).filter((tag) => tag.severity !== 'success') : [];
}

function profileSettings(): Pick<DBAssistantProfile, 'modelId' | 'disabledGroups' | 'instructions'> {
  return { modelId: activeModelId.value ?? '', disabledGroups: [...disabledGroups.value], instructions: instructions.value.trim() };
}

function saveAsProfile(): void {
  const typing = Boolean(document.activeElement?.closest('.cui-assistant-composer'));
  dialog.openComponentDialog<AssistantProfileNameProps>(AssistantProfileName, {
    data: {
      title: t('views.assistant.profile_save'),
      confirmText: t('components.form.button.save'),
      contentProps: {},
    },
    onConfirm: async (name: string | null) => {
      if (!name) return;
      const profile = await createProfileMutation.mutateAsync({ name, ...profileSettings() });
      profileId.value = profile._id;
    },
    onSettled: () => {
      if (typing) emit('refocus');
    },
  });
}

async function updateProfile(): Promise<void> {
  if (!profileId.value) return;
  await patchProfileMutation.mutateAsync({ profileId: profileId.value, patch: profileSettings() });
}

async function deleteProfile(): Promise<void> {
  if (!profileId.value) return;
  await deleteProfileMutation.mutateAsync(profileId.value);
  profileId.value = null;
}

watch(
  () => props.panel,
  (panel) => {
    if (panel === 'memory') refetchMemory();
  },
  { immediate: true },
);
</script>

<style scoped>
.cui-assistant-tray {
  max-height: min(28rem, var(--cui-tray-max, 28rem));
  background: var(--card-background);
  border: 1px solid var(--border-color-inner);
  border-bottom: none;
  border-radius: 1rem 1rem 0 0;
  transition: border-color 160ms ease;
}

.cui-assistant-options {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border-color-inner);
  border-radius: 0.75rem;
}

.cui-assistant-option {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-height: 2.75rem;
  padding: 0.5rem 0.875rem;
  font-size: 14px;
  text-align: left;
  color: var(--text-color);
  background: transparent;
}

.cui-assistant-option + .cui-assistant-option {
  border-top: 1px solid var(--border-color-inner);
}

button.cui-assistant-option:hover {
  background: color-mix(in srgb, var(--p-primary-color) 6%, transparent);
}

.cui-assistant-option-mark {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.125rem;
  height: 1.125rem;
  flex-shrink: 0;
  color: var(--p-primary-color);
  visibility: hidden;
}

.cui-assistant-option-box {
  visibility: visible;
  color: transparent;
  border: 1px solid var(--border-color);
  border-radius: 0.3rem;
}

.cui-assistant-option-on .cui-assistant-option-mark {
  visibility: visible;
}

.cui-assistant-option-on .cui-assistant-option-box {
  color: var(--p-primary-contrast-color);
  background: var(--p-primary-color);
  border-color: var(--p-primary-color);
}
</style>
