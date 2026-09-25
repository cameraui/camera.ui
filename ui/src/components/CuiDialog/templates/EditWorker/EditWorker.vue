<template>
  <div class="flex flex-col gap-6 w-full">
    <div class="flex flex-col gap-2">
      <label for="workerName" class="cui-label">{{ $t('views.workers.name') }}</label>
      <InputText id="workerName" v-model="name" class="w-full" autofocus />
    </div>

    <div class="flex flex-col gap-2">
      <label for="workerServerAddresses" class="cui-label">{{ $t('components.form.label.server_addresses') }}</label>
      <MultiSelect
        v-model="serverAddresses"
        input-id="workerServerAddresses"
        :options="addressOptions"
        :max-selected-labels="2"
        :show-toggle-all="false"
        show-clear
        option-label="address"
        option-value="address"
        display="chip"
        class="w-full"
      />
      <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('views.workers.server_addresses_hint') }}</Message>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CustomDialogComponent } from '@/composables/useCuiDialog.js';
import type { EditWorkerProps, EditWorkerResult } from './types.js';

const props = defineProps<EditWorkerProps>();

const name = ref(props.currentName);
const serverAddresses = ref([...props.serverAddresses]);

const addressOptions = computed(() => {
  const missing = props.serverAddresses.filter((address) => !props.addresses.some((option) => option.address === address));
  return [...props.addresses, ...missing.map((address) => ({ address }))];
});

defineExpose<CustomDialogComponent>({
  onConfirm: async (): Promise<EditWorkerResult | null> => {
    const trimmed = name.value.trim();
    if (!trimmed) return null;
    return { name: trimmed, serverAddresses: serverAddresses.value };
  },
});
</script>
