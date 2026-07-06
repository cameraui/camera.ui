import type { JsonSchemaWithoutCallbacks } from '@camera.ui/sdk';
import type { DiscoveredCameraWithState } from '@camera.ui/sdk/internal';

export interface ConnectionSchemaProps {
  camera: DiscoveredCameraWithState;
  schema: JsonSchemaWithoutCallbacks[];
  onConnect: (credentials: Record<string, unknown>) => Promise<void>;
}
