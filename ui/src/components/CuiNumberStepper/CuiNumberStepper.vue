<template>
  <InputNumber ref="inputNumber" :show-buttons :button-layout="isTouch ? 'horizontal' : 'stacked'" :min-fraction-digits :max-fraction-digits :pt="passThrough">
    <template v-if="isTouch" #incrementicon><i-tabler:plus class="h-4 w-4" /></template>
    <template v-if="isTouch" #decrementicon><i-tabler:minus class="h-4 w-4" /></template>
  </InputNumber>
</template>

<script setup lang="ts">
import { CUI_NUMBER_STEPPER_DEFAULTS } from './types.js';

import type { CuiNumberStepperProps, InputNumberSpinner } from './types.js';

const props = withDefaults(defineProps<CuiNumberStepperProps>(), CUI_NUMBER_STEPPER_DEFAULTS);

const { isTouch } = useSharedCuiUserAgent();

const inputNumber = useTemplateRef<InputNumberSpinner>('inputNumber');

const decimalKeyboard = computed(() => !props.minFractionDigits && (props.maxFractionDigits ?? 0) > 0);

const passThrough = computed(() => ({
  ...(decimalKeyboard.value ? { pcInputText: { root: { inputmode: 'decimal' } } } : {}),
  ...(isTouch.value ? { incrementButton: touchSteps(1), decrementButton: touchSteps(-1) } : {}),
}));

function touchSteps(direction: 1 | -1) {
  return {
    onTouchstart: (event: TouchEvent) => {
      event.preventDefault();
      if (!inputNumber.value?.disabled) inputNumber.value?.repeat(event, null, direction);
    },
    onTouchend: () => inputNumber.value?.clearTimer(),
    onTouchcancel: () => inputNumber.value?.clearTimer(),
  };
}
</script>
