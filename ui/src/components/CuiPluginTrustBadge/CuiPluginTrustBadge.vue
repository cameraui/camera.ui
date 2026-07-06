<template>
  <span v-if="meta" v-tooltip.top="{ value: $t(meta.descriptionKey) }" class="cui-trust-badge" :class="meta.class">
    <component :is="meta.icon" class="cui-trust-badge-icon" />
    <span v-if="showLabel" class="cui-trust-badge-label">{{ $t(meta.labelKey) }}</span>
  </span>
</template>

<script setup lang="ts">
import { PLUGIN_TRUST_META } from './types.js';

import type { CuiPluginTrustBadgeProps } from './types.js';

const props = withDefaults(defineProps<CuiPluginTrustBadgeProps>(), {
  showLabel: true,
});

const meta = computed(() => (props.trust ? PLUGIN_TRUST_META[props.trust] : undefined));
</script>

<style scoped>
.cui-trust-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.7rem;
  font-weight: 600;
  line-height: 1.2;
  white-space: nowrap;
  border: 1px solid transparent;
}

.cui-trust-badge-icon {
  width: 0.85rem;
  height: 0.85rem;
  flex-shrink: 0;
}

.cui-trust-official {
  color: var(--text-primary-color);
  background: color-mix(in srgb, var(--text-primary-color) 12%, transparent);
  border-color: color-mix(in srgb, var(--text-primary-color) 35%, transparent);
}

.cui-trust-verified {
  color: var(--p-blue-500, #3b82f6);
  background: color-mix(in srgb, var(--p-blue-500, #3b82f6) 12%, transparent);
  border-color: color-mix(in srgb, var(--p-blue-500, #3b82f6) 35%, transparent);
}

.cui-trust-community {
  color: var(--text-muted-color);
  background: color-mix(in srgb, var(--text-muted-color) 12%, transparent);
  border-color: var(--border-color-inner);
}
</style>
