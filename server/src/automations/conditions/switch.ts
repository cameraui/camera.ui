import { looseEquals } from '../parseValue.js';
import { caseHandleId, readSwitchCases } from '../switchHandles.js';

import type { ActionContext } from '../actions/types.js';
import type { ConditionResult } from './types.js';

export function conditionSwitch(ctx: ActionContext, data: Record<string, unknown>): ConditionResult {
  const val = ctx.resolve(data.variable as string);
  const cases = readSwitchCases(data);

  const match = cases.find((c) => looseEquals(c, val));
  if (match === undefined) {
    ctx.logger.debug(`Automation "${ctx.flowName}": switch value "${val}" matched no case [${cases.join(', ')}]`);
    return null;
  }

  return { handle: caseHandleId(match) };
}
