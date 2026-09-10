import type { AssistantSettingKey } from '@shared/types';

export interface CuiAssistantSettingProps {
  setting: AssistantSettingKey;
}

export const ASSISTANT_SETTING_KEYS: AssistantSettingKey[] = ['terminalEnabled', 'memoryEnabled', 'sendImages'];
