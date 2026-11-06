import type { InputNumberEmitsOptions, InputNumberProps } from 'openvue/inputnumber';

interface InputNumberListeners {
  'onUpdate:modelValue'?: InputNumberEmitsOptions['update:modelValue'];
  onValueChange?: InputNumberEmitsOptions['value-change'];
  onInput?: InputNumberEmitsOptions['input'];
}

export interface CuiNumberStepperProps extends /* @vue-ignore */ InputNumberProps, /* @vue-ignore */ InputNumberListeners {
  showButtons?: boolean;
  minFractionDigits?: number;
  maxFractionDigits?: number;
}

export const CUI_NUMBER_STEPPER_DEFAULTS = {
  showButtons: true,
} satisfies Partial<CuiNumberStepperProps>;
