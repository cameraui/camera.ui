<template>
  <div class="flex flex-col gap-4 w-full">
    <component :is="configComponent" v-if="configComponent" :data="node.data" :node-id="node.id" @update:data="onUpdateData" />
    <div v-else class="text-sm text-muted">
      {{ t('views.automation.no_node_selected') }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { CONFIG_MAP } from '../config/configMap.js';

import type { CuiAutomationMobileNodeConfigProps } from '../types.js';

const props = defineProps<CuiAutomationMobileNodeConfigProps>();

const { t } = useI18n();

const store = useAutomationsStore();

const configComponent = computed(() => {
  if (!props.node.type) return undefined;
  return CONFIG_MAP[props.node.type];
});

function onUpdateData(data: Record<string, unknown>) {
  if (!store.draft) return;
  const nodes = store.draft.nodes as unknown as { id: string; data?: Record<string, unknown> }[];
  const node = nodes.find((n) => n.id === props.node.id);
  if (node?.data) {
    Object.assign(node.data, data);
  }
}

defineExpose<CustomDialogComponent>({
  onConfirm: async () => {
    if (store.draft) {
      const nodeId = props.node.id;
      store.draft.nodes = (store.draft.nodes as unknown as { id: string }[]).filter((n) => n.id !== nodeId) as typeof store.draft.nodes;
      store.draft.edges = (store.draft.edges as unknown as { source: string; target: string }[]).filter(
        (e) => e.source !== nodeId && e.target !== nodeId,
      ) as typeof store.draft.edges;
    }
  },
});
</script>
