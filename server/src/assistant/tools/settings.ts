import { toolDefinition } from '@tanstack/ai';
import * as zod from 'zod';

import { ASSISTANT_SETTING_EVENT } from './shared.js';

import type { AssistantSettingKey } from '../types.js';
import type { CoreTool, ToolContext } from './shared.js';

const SETTING_KEYS = ['terminalEnabled', 'memoryEnabled', 'sendImages'] as const satisfies readonly AssistantSettingKey[];

const suggestSetting = toolDefinition({
  name: 'suggest_setting',
  lazy: true,
  description:
    'Show a switch for an assistant setting that is off and would answer the request: terminalEnabled (shell commands), memoryEnabled (remember facts), ' +
    'sendImages (pictures to the model). Call it instead of describing where the setting lives.',
  inputSchema: zod.object({
    setting: zod.enum(SETTING_KEYS),
  }),
  metadata: { interactive: true },
}).server<ToolContext['context']>(({ setting }, ctx) => {
  ctx.emitCustomEvent(ASSISTANT_SETTING_EVENT, { toolCallId: ctx.toolCallId ?? null, setting });
  return `The user sees a switch for ${setting} under your answer. Do not describe where the setting lives, just answer with what works without it.`;
});

export const settingTools: CoreTool[] = [suggestSetting];
