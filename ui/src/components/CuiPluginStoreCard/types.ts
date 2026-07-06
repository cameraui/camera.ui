import type { CameraUiPlugin } from '@shared/types';

export interface CuiPluginStoreCardProps {
  plugin: CameraUiPlugin;
  inProgress?: boolean;
}

export interface CuiPluginStoreCardEmits {
  open: [plugin: CameraUiPlugin];
  install: [plugin: CameraUiPlugin];
}
