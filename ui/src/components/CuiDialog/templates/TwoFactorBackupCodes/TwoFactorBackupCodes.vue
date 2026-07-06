<template>
  <div class="flex flex-col gap-6">
    <Message severity="warn">{{ $t('views.settings.security.backup_warning') }}</Message>

    <div class="backup-codes-grid">
      <span v-for="code in backupCodes" :key="code" class="backup-code">{{ code }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TwoFactorBackupCodesProps } from './types.js';

const props = defineProps<TwoFactorBackupCodesProps>();

const { backupCodes } = toRefs(props);

async function onConfirm(): Promise<void> {
  // Just close the dialog
}

defineExpose({
  onConfirm,
});
</script>

<style scoped>
.backup-codes-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.5rem;
  padding: 1rem;
  border-radius: 0.5rem;
  background: var(--p-form-field-background);
  font-family: monospace;
  text-align: center;
  border: 1px solid var(--border-color);
}

.backup-code {
  padding: 0.5rem;
  border-radius: 0.375rem;
  background: var(--p-content-background);
  border: 1px solid var(--border-color);
}
</style>
