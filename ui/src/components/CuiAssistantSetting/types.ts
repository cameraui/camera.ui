import type { AssistantSettingKey } from '@shared/types';

export interface CuiAssistantSettingProps {
  setting: AssistantSettingKey;
  modelId?: string | null;
}

export const ASSISTANT_SETTING_KEYS: AssistantSettingKey[] = ['terminalEnabled', 'memoryEnabled', 'sendImages'];
