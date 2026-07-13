<template>
  <div class="flex flex-col gap-6">
    <p class="text-muted">{{ $t('instances.two_factor_hint', { name: instanceName }) }}</p>

    <div class="flex flex-col gap-2 justify-center items-center mt-2">
      <label class="cui-label">{{ $t('views.settings.security.enter_code') }}</label>
      <InputOtp v-model="code" :length="6" integer-only class="justify-center" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { InstanceTwoFactorPromptProps } from './types.js';

const props = defineProps<InstanceTwoFactorPromptProps>();

const { instanceName } = toRefs(props);

const code = ref('');

const isDisabled = computed(() => code.value.length < 6);

async function onConfirm(): Promise<string | null> {
  if (code.value.length < 6) return null;
  return code.value;
}

defineExpose({
  isDisabled,
  onConfirm,
});
</script>

<style scoped></style>
