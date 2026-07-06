<template>
  <div class="h-full overflow-y-auto flex flex-col">
    <div class="flex items-center gap-2 px-4 py-3 border-bottom-color">
      <div class="flex items-center justify-center w-8 h-8 rounded-md shrink-0" :style="{ backgroundColor: `${definition?.color}20`, color: definition?.color }">
        <component :is="definition?.icon" class="w-4 h-4" />
      </div>
      <div class="flex-1 min-w-0">
        <div class="text-sm font-semibold truncate text-color">{{ definition ? t(definition.labelKey) : node.type }}</div>
        <div class="text-xs text-muted">{{ t('views.automation.node_config') }}</div>
      </div>
      <Button severity="secondary" text rounded class="shrink-0 cui-icon-sm" @click="$emit('close')">
        <template #icon>
          <i-mdi:close width="100%" height="100%" />
        </template>
      </Button>
    </div>

    <div class="flex-1 overflow-y-auto">
      <Accordion multiple :value="openPanels" class="w-[300px]">
        <AccordionPanel v-if="isAction" value="alias">
          <AccordionHeader class="px-4 rounded-none!">
            <span class="text-color font-normal text-sm">{{ t('components.automation_nodes.alias') }}</span>
          </AccordionHeader>
          <AccordionContent :pt="{ content: { class: 'px-4 w-[300px]' } }">
            <div class="flex flex-col field-gap">
              <InputText
                :model-value="(node.data as any).alias ?? ''"
                :placeholder="t('components.automation_nodes.alias_placeholder')"
                @update:model-value="onUpdateData({ alias: $event || undefined })"
              />
              <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ t('components.automation_nodes.alias_hint') }}</Message>
            </div>
          </AccordionContent>
        </AccordionPanel>

        <AccordionPanel v-if="configComponent" value="config">
          <AccordionHeader class="px-4 rounded-none!">
            <span class="text-color font-normal text-sm">{{ t('views.automation.node_config') }}</span>
          </AccordionHeader>
          <AccordionContent :pt="{ content: { class: 'px-4 w-[300px]' } }">
            <div>
              <component :is="configComponent" :data="node.data" :node-id="node.id" @update:data="onUpdateData" />
            </div>
          </AccordionContent>
        </AccordionPanel>

        <AccordionPanel v-if="definition?.supportsRepeat" value="repeat">
          <AccordionHeader class="px-4 rounded-none!">
            <span class="text-color font-normal text-sm">{{ t('components.automation_nodes.repeat') }}</span>
          </AccordionHeader>
          <AccordionContent :pt="{ content: { class: 'px-4 w-[300px]' } }">
            <div class="flex flex-col gap-3">
              <div class="flex flex-col field-gap">
                <label class="cui-label">{{ t('components.automation_nodes.repeat_count') }}</label>
                <InputNumber :model-value="(node.data as any).repeat ?? 1" :min="1" :max="100000" class="w-full" @update:model-value="onUpdateData({ repeat: $event })" />
              </div>
              <div v-if="(node.data as any).repeat > 1" class="flex flex-col field-gap">
                <label class="cui-label">{{ t('components.automation_nodes.repeat_concurrency') }}</label>
                <InputNumber
                  :model-value="(node.data as any).repeatConcurrency ?? 1"
                  :min="1"
                  :max="64"
                  class="w-full"
                  @update:model-value="onUpdateData({ repeatConcurrency: $event })"
                />
                <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
                  t('components.automation_nodes.repeat_concurrency_hint')
                }}</Message>
              </div>
              <div v-if="(node.data as any).repeat > 1" class="flex flex-col field-gap">
                <label class="cui-label">{{ t('components.automation_nodes.repeat_delay') }}</label>
                <InputNumber
                  :model-value="(node.data as any).repeatDelayMs ?? 0"
                  :min="0"
                  :max="60000"
                  suffix=" ms"
                  class="w-full"
                  @update:model-value="onUpdateData({ repeatDelayMs: $event })"
                />
              </div>
            </div>
          </AccordionContent>
        </AccordionPanel>
      </Accordion>
    </div>

    <div class="p-4 border-top-color">
      <Button severity="danger" fluid class="w-full cui-button-medium" :label="t('views.automation.delete_node')" @click="$emit('delete')" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { CONFIG_MAP } from './config/configMap.js';
import { getNodeDefinition } from './nodeDefinitions.js';

import type { AutomationNodeData, CuiAutomationNodeConfigEmits, CuiAutomationNodeConfigProps } from './types.js';

const props = defineProps<CuiAutomationNodeConfigProps>();

const emit = defineEmits<CuiAutomationNodeConfigEmits>();

const { t } = useI18n();

const definition = computed(() => (props.node.type ? getNodeDefinition(props.node.type) : undefined));
const isAction = computed(() => props.node.type?.startsWith('action-'));

const configComponent = computed(() => {
  if (!props.node.type) return undefined;
  return CONFIG_MAP[props.node.type];
});

const openPanels = computed(() => {
  const panels = ['config'];
  if (isAction.value && (props.node.data as any).alias) panels.push('alias');
  if (definition.value?.supportsRepeat && (props.node.data as any).repeat > 1) panels.push('repeat');
  return panels;
});

function onUpdateData(data: Record<string, unknown>) {
  emit('update:data', data as Partial<AutomationNodeData>);
}
</script>
