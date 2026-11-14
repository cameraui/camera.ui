<template>
  <div class="flex flex-col gap-6">
    <Message severity="warn">{{ warning }}</Message>

    <InputGroup>
      <InputText :model-value="secret" readonly class="font-mono text-sm" />
      <CuiCopyAddon :value="secret" />
    </InputGroup>
  </div>
</template>

<script setup lang="ts">
import type { SecretCreatedProps } from './types.js';

defineProps<SecretCreatedProps>();

async function onConfirm(): Promise<void> {
  // just close
}

defineExpose({
  onConfirm,
});
</script>
