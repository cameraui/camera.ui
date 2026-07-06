import type { JsonSchema } from '@camera.ui/sdk';

export interface RemoveItem {
  key: string;
  index: number;
}

export interface CuiSchemaFieldProps {
  schemaField: JsonSchema | Omit<JsonSchema, 'key'>;
  configKey: string;
  arrayItem?: RemoveItem;
  loading?: boolean;
}

export interface CuiSchemaFieldEmits {
  (e: 'onAction', state: { key: string }): void;
  (e: 'onSubmit', state: { key: string }): void;
  (e: 'onTrigger'): void;
}
