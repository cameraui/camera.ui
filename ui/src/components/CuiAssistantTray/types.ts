import type { ToolGroupOption } from '@/components/CuiAssistantConversation/types.js';
import type { AssistantModelView } from '@shared/types';

export type AssistantTrayPanel = 'tools' | 'memory';

export interface CuiAssistantTrayProps {
  panel: AssistantTrayPanel;
  groups: ToolGroupOption[];
  models: AssistantModelView[];
  defaultModelId?: string;
}

export interface CuiAssistantTrayEmits {
  (e: 'close'): void;
  (e: 'refocus'): void;
}
