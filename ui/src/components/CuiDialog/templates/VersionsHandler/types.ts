import type { CameraUiPlugin } from '@shared/types';

export interface PluginTarget extends CameraUiPlugin {}

export interface ServerTarget {
  type: 'server';
}

export interface VersionsHandlerProps {
  target: PluginTarget | ServerTarget;
  installVersion?: string;
  isNewPlugin?: boolean;
  action?: 'install' | 'uninstall';
}

export function isPluginTarget(target: PluginTarget | ServerTarget): target is PluginTarget {
  return 'id' in target && !('type' in target);
}

export function isServerTarget(target: PluginTarget | ServerTarget): target is ServerTarget {
  return 'type' in target;
}
