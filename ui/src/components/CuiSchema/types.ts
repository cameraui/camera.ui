import type { PluginConfig, SchemaConfig } from '@camera.ui/sdk';
import type { ButtonProps } from 'primevue';

export interface CuiSchemaProps {
  // config: PluginConfig;
  schemaForm: SchemaConfig;
  loading?: boolean;
  disableButton?: boolean;
  saveButton?: boolean;
  saveButtonLabel?: string;
  saveButtonColor?: ButtonProps['severity'];
  showButton?: boolean;
}

export interface CuiSchemaEmits {
  (e: 'onSubmit', state: { key: string; payload: any }): void;
  (e: 'onAction', state: { key: string }): void;
  (e: 'onFormSubmit', state: PluginConfig): void;
  (e: 'changeGroup', state: string): void;
}
