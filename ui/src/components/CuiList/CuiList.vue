<template>
  <Card class="cui-card" :pt="{ body: { class: 'p-0' } }" v-bind="cardProps" :class="cardClass" :style="cardStyle">
    <template #content>
      <template v-for="(child, i) in items" :key="i">
        <component
          :is="child"
          v-bind="dividers !== false ? { divider: i < items.length - 1 } : {}"
          :size="size"
          :radius="items.length === 1 ? 'both' : i === 0 ? 'top' : i === items.length - 1 ? 'bottom' : 'none'"
        />
      </template>
    </template>
  </Card>
</template>

<script setup lang="ts">
import { Fragment } from 'vue';

import type { CuiListProps } from './types.js';

const props = withDefaults(defineProps<CuiListProps>(), {
  card: true,
  size: 'default',
});

const slots = useSlots();

const { cardProps, cardClass, cardStyle, dividers } = toRefs(props);

const items = computed(() => {
  const defaultSlot = slots.default?.();
  if (!defaultSlot) return [];

  const children: VNode[] = [];
  for (const node of defaultSlot) {
    // Flatten fragments (v-for, v-if)
    if (node.type === Fragment && Array.isArray(node.children)) {
      for (const child of node.children) {
        if (typeof child === 'object' && child !== null) {
          children.push(child as VNode);
        }
      }
    } else {
      children.push(node);
    }
  }

  return children;
});
</script>
