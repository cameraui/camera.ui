import { actionCameraControl } from './cameraControl.js';
import { actionDelay } from './delay.js';
import { actionHttp } from './http.js';
import { actionNotification } from './notification.js';
import { actionPlugin } from './plugin.js';
import { actionSensor } from './sensor.js';
import { actionSnapshot } from './snapshot.js';
import { actionVariable } from './variable.js';

import type { ActionHandler } from './types.js';

export const ACTION_HANDLERS: Record<string, ActionHandler> = {
  'action-snapshot': actionSnapshot,
  'action-sensor': actionSensor,
  'action-notification': actionNotification,
  'action-http': actionHttp,
  'action-delay': actionDelay,
  'action-variable': actionVariable,
  'action-plugin': actionPlugin,
  'action-camera-control': actionCameraControl,
};

export type { ActionContext, ActionHandler } from './types.js';
export { clearCachedPluginCall } from './plugin.js';
