import type { BindingValue, WizardInput } from '@/common/automationBlueprint.js';
import type { AutomationStoreBlueprint } from '@/components/CuiAutomation/types.js';

export interface AutomationImportProps {
  blueprint: AutomationStoreBlueprint;
}

export interface AutomationInputPickerProps {
  input: WizardInput;
  modelValue: BindingValue;
}

export interface AutomationInputPickerEmits {
  (e: 'update:modelValue', value: BindingValue): void;
}
