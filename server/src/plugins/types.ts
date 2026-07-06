import type { Camera, PluginInfo } from '@camera.ui/sdk';

export const PLUGIN_IDENTIFIER_PATTERN = /^((@[\w-.]*)\/)?(camera-ui-[\w-]*)$/;

export interface Context {
  engines?: Record<string, string>;
  dependencies?: Record<string, string>;
}

export interface ProcessLoadMessage {
  cameras: Camera[];
  plugin: PluginInfo;
  storage: PluginStorage;
}

export interface ProcessMessage {
  type: PLUGIN_COMMAND;
  data?: ProcessLoadMessage;
}

export interface ProcessResponse {
  type: PLUGIN_STATUS;
  error?: string;
}

export enum PLUGIN_STATUS {
  READY = 'ready',
  STARTING = 'starting',
  STARTED = 'started',
  STOPPING = 'stopping',
  STOPPED = 'stopped',
  ERROR = 'error',
  UNKNOWN = 'unknown',
  DISABLED = 'disabled',
  INCOMPATIBLE = 'incompatible',
}

export enum PLUGIN_COMMAND {
  START = 'start',
  STOP = 'stop',
}

export interface PluginStorage {
  installPath: string;
  storagePath: string;
}
