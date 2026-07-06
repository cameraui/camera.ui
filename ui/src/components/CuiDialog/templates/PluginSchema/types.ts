import type { SchemaConfig } from '@camera.ui/sdk';

export type PluginSchemaStorageType = 'plugin' | 'camera' | 'sensor';

export interface PluginSchemaProps {
  schemaConfig: SchemaConfig;
  pluginName: string;
  cameraName?: string;
  buttonKey: string;
  sensorId?: string;
  pluginId?: string;
}
