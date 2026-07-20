<template>
  <div class="flex items-center gap-2 px-3 py-2 border-bottom-color card-background min-h-[48px]">
    <Button v-if="!smBreakpoint" severity="secondary" text rounded class="cui-icon-md shrink-0" @click="$router.push('/automations')">
      <template #icon>
        <i-weui:back-filled width="100%" height="100%" />
      </template>
    </Button>

    <InputText
      :model-value="flow.name"
      class="font-medium text-sm min-w-0 flex-1"
      :class="{ 'max-w-[300px]': !smBreakpoint }"
      :placeholder="t('views.automations.flow_name_placeholder')"
      @update:model-value="$emit('update:name', String($event ?? ''))"
    />

    <div class="flex-1" />

    <ToggleSwitch :model-value="flow.enabled" class="shrink-0" @update:model-value="$emit('toggle-enabled')" />

    <Button
      v-if="showHistory"
      v-tooltip.bottom="{ value: t('views.automations.run_history') }"
      severity="secondary"
      text
      rounded
      class="cui-icon-md shrink-0"
      @click="$emit('show-history')"
    >
      <template #icon>
        <i-mdi:history width="100%" height="100%" />
      </template>
    </Button>

    <Button severity="secondary" text rounded class="cui-icon-md shrink-0" @click="menuRef?.toggleMenu($event)">
      <template #icon>
        <i-carbon:settings width="100%" height="100%" />
      </template>
    </Button>

    <CuiMenu
      ref="menuRef"
      :items="menuItems"
      :auto-hide="false"
      :popover="{
        pt: {
          root: { class: 'w-[18rem]' },
          content: {
            class: 'p-0! rounded-xl! overflow-hidden!',
          },
        },
      }"
    />
  </div>
</template>

<script setup lang="ts">
import type { CuiAutomationToolbarEmits, CuiAutomationToolbarProps } from './types.js';

const props = defineProps<CuiAutomationToolbarProps>();

const emit = defineEmits<CuiAutomationToolbarEmits>();

const { t } = useI18n();
const { smBreakpoint } = useSharedCuiBreakpoint();

const menuRef = useTemplateRef('menuRef');

const menuItems = computed(() => [
  {
    key: 'suppressDuplicates',
    label: t('views.automation.suppress_duplicates'),
    description: t('views.automation.suppress_duplicates_hint'),
    toggle: true,
    toggleState: props.flow.suppressDuplicates,
    onClick: () => emit('toggle-suppress-duplicates'),
  },
  {
    key: 'singleExecution',
    label: t('views.automation.single_execution'),
    description: t('views.automation.single_execution_hint'),
    toggle: true,
    toggleState: props.flow.singleExecution,
    onClick: () => emit('toggle-single-execution'),
  },
]);
</script>
