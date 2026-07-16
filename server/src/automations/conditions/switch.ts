import { caseHandleId, readSwitchCases } from '../switchHandles.js';

import type { ActionContext } from '../actions/types.js';
import type { ConditionResult } from './types.js';

export function conditionSwitch(ctx: ActionContext, data: Record<string, unknown>): ConditionResult {
  const val = ctx.resolve(data.variable as string);
  const cases = readSwitchCases(data);

  if (!cases.includes(val)) return null;
  return { handle: caseHandleId(val) };
}
