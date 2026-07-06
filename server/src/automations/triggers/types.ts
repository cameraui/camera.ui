import type { Disposable } from '@camera.ui/sdk';
import type { CameraUiAPI } from '../../api.js';
import type { DBAutomation, DBAutomationNode } from '../../api/database/types.js';
import type { LoggerService } from '../../services/logger/index.js';
import type { FlowContext } from '../context.js';

export interface TriggerContext {
  api: CameraUiAPI;
  logger: LoggerService;
  executeFlow: (flow: DBAutomation, triggerNode: DBAutomationNode, context: FlowContext) => Promise<void>;
  addSubscription: (flowId: string, sub: Disposable) => void;
  addSchedule: (flowId: string, timer: NodeJS.Timeout) => void;
}
