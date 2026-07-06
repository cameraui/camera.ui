export interface CuiDoorbellTriggerProps {
  ring?: boolean;
  label?: string;
  disabled?: boolean;
  size?: 'small' | 'medium' | 'large';
}

export interface CuiDoorbellTriggerEmits {
  (e: 'update:ring', value: boolean): void;
  (e: 'trigger'): void;
}

export const CUI_DOORBELL_TRIGGER_DEFAULTS = {
  ring: false,
  disabled: false,
  size: 'medium',
} satisfies Partial<CuiDoorbellTriggerProps>;
