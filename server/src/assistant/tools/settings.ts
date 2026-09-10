import { toolDefinition } from '@tanstack/ai';
import * as zod from 'zod';

import { ASSISTANT_SETTING_EVENT } from './shared.js';

import type { AssistantSettingKey } from '../types.js';
import type { CoreTool, ToolContext } from './shared.js';

const SETTING_KEYS = ['terminalEnabled', 'memoryEnabled', 'sendImages'] as const satisfies readonly AssistantSettingKey[];

const suggestSetting = toolDefinition({
  name: 'suggest_setting',
  description:
    'Show the user a switch for an assistant setting that is off and would answer their request: terminalEnabled (shell commands on the server), ' +
    'memoryEnabled (remembering facts about the user), sendImages (pictures go to the model). Admins flip it right in the chat, others see who ' +
    'can. Call it instead of describing where the setting lives, then answer with what works without it.',
  inputSchema: zod.object({
    setting: zod.enum(SETTING_KEYS),
  }),
  metadata: { interactive: true },
}).server<ToolContext['context']>(({ setting }, ctx) => {
  ctx.emitCustomEvent(ASSISTANT_SETTING_EVENT, { toolCallId: ctx.toolCallId ?? null, setting });
  return `The user sees a switch for ${setting} under your answer. Do not describe where the setting lives, just answer with what works without it.`;
});

export const settingTools: CoreTool[] = [suggestSetting];
