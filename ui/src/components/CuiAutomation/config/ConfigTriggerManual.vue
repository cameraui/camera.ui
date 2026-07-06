<template>
  <div class="flex flex-col gap-2">
    <span class="text-sm text-muted">{{ t('components.automation_nodes.trigger_manual_desc') }}</span>
  </div>
</template>

<script setup lang="ts">
import type { ConfigNodeUpdateEmits, ConfigTriggerManualProps } from '../types.js';

defineProps<ConfigTriggerManualProps>();

defineEmits<ConfigNodeUpdateEmits>();

const { t } = useI18n();
</script>
