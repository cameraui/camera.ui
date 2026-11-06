<template>
  <InputNumber
    :show-buttons
    :button-layout="isTouch ? 'horizontal' : 'stacked'"
    :min-fraction-digits
    :max-fraction-digits
    :pt="decimalKeyboard ? { pcInputText: { root: { inputmode: 'decimal' } } } : undefined"
  >
    <template v-if="isTouch" #incrementicon><i-tabler:plus class="h-4 w-4" /></template>
    <template v-if="isTouch" #decrementicon><i-tabler:minus class="h-4 w-4" /></template>
  </InputNumber>
</template>

<script setup lang="ts">
import { CUI_NUMBER_STEPPER_DEFAULTS } from './types.js';

import type { CuiNumberStepperProps } from './types.js';

const props = withDefaults(defineProps<CuiNumberStepperProps>(), CUI_NUMBER_STEPPER_DEFAULTS);

const { isTouch } = useSharedCuiUserAgent();

const decimalKeyboard = computed(() => !props.minFractionDigits && (props.maxFractionDigits ?? 0) > 0);
</script>
