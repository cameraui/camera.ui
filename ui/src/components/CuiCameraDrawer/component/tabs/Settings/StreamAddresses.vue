<template>
  <div class="flex flex-col gap-3">
    <div v-for="address in addresses" :key="address.url" class="flex flex-col field-gap">
      <span class="cui-label">{{ address.label }}</span>
      <InputGroup>
        <InputText :model-value="address.url" :aria-label="address.label" readonly class="font-mono text-xs" />
        <CuiCopyAddon :value="address.url" />
      </InputGroup>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { StreamAddressesProps } from '../../types.js';

defineProps<StreamAddressesProps>();
</script>
