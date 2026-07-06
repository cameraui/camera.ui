import type { CameraUiAPI } from '../../api.js';
import type { CameraController } from '../../camera/controller.js';
import type { LoggerService } from '../../services/logger/index.js';

export interface ActionContext {
  variables: Map<string, string>;
  api: CameraUiAPI;
  logger: LoggerService;
  suppressVariableWrites: boolean;
  resolve: (template: string) => string;
  getCamera: (cameraId: string) => CameraController;
  flowId: string;
  flowName: string;
}

export type ActionHandler = (ctx: ActionContext, data: Record<string, unknown>) => Promise<void> | void;
