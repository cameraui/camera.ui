import type { ActionContext } from '../actions/types.js';
import type { ConditionResult } from './types.js';

export function conditionSwitch(ctx: ActionContext, data: Record<string, unknown>): ConditionResult {
  const val = ctx.resolve(data.variable as string);
  const cases = data.cases as string[];
  const matchIndex = cases.indexOf(val);

  if (matchIndex < 0) return null;
  return { index: matchIndex };
}
