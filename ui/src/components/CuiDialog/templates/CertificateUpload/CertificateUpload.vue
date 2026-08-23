<template>
  <div class="flex flex-col gap-6">
    <span class="text-sm text-muted">{{ $t('views.settings.certificate_upload_info') }}</span>

    <div v-for="slot in slots" :key="slot.key">
      <label class="cui-label mb-1">{{ slot.label }}</label>
      <div
        class="border-2 border-dashed border-surface-300 dark:border-surface-600 rounded-lg p-4 text-center cursor-pointer hover:border-primary transition-colors"
        @click="pick(slot.key)"
        @dragover.prevent
        @drop.prevent="drop(slot.key, $event)"
      >
        <div v-if="!files[slot.key]" class="flex items-center justify-center gap-2 text-sm text-muted">
          <i-tabler:upload class="w-4 h-4 shrink-0" />
          <span>{{ slot.hint }}</span>
        </div>
        <div v-else class="flex items-center justify-center gap-2 text-sm">
          <i-tabler:file-certificate class="w-4 h-4 shrink-0 text-success" />
          <span class="truncate">{{ files[slot.key]!.name }}</span>
        </div>
      </div>
      <span v-if="slot.optional" class="text-xs text-muted">{{ $t('views.settings.certificate_chain_hint') }}</span>
    </div>

    <input ref="fileInput" type="file" accept=".pem,.crt,.cer,.key" class="hidden" @change="onSelect" />

    <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>
  </div>
</template>

<script setup lang="ts">
import type { CustomDialogComponent } from '@/composables/useCuiDialog.js';
import type { CertificateUploadResult } from './types.js';

type SlotKey = 'cert' | 'key' | 'chain';

const { t } = useI18n();

const fileInput = useTemplateRef<HTMLInputElement>('fileInput');
const files = ref<Record<SlotKey, File | null>>({ cert: null, key: null, chain: null });
const error = ref('');

let active: SlotKey = 'cert';

const slots = computed(() => [
  { key: 'cert' as const, label: t('views.settings.certificate_file'), hint: t('views.settings.certificate_file_hint'), optional: false },
  { key: 'key' as const, label: t('views.settings.certificate_key_file'), hint: t('views.settings.certificate_key_file_hint'), optional: false },
  { key: 'chain' as const, label: t('views.settings.certificate_chain_file'), hint: t('views.settings.certificate_chain_file_hint'), optional: true },
]);

function pick(slot: SlotKey): void {
  active = slot;
  if (fileInput.value) fileInput.value.value = '';
  fileInput.value?.click();
}

function onSelect(event: Event): void {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) take(active, file);
}

function drop(slot: SlotKey, event: DragEvent): void {
  const file = event.dataTransfer?.files[0];
  if (file) take(slot, file);
}

function take(slot: SlotKey, file: File): void {
  if (file.size > MAX_SIZE) {
    error.value = t('views.settings.certificate_file_too_large');
    return;
  }
  error.value = '';
  files.value = { ...files.value, [slot]: file };
}

const MAX_SIZE = 512 * 1024;

defineExpose<CustomDialogComponent>({
  onConfirm: async (): Promise<CertificateUploadResult | null> => {
    const { cert, key, chain } = files.value;
    if (!cert || !key) {
      error.value = t('views.settings.certificate_missing_files');
      return null;
    }
    return { cert, key, chain: chain ?? undefined };
  },
});
</script>
