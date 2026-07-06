import type { ActionContext } from '../actions/types.js';
import type { ConditionResult } from './types.js';

export function conditionIfElse(ctx: ActionContext, data: Record<string, unknown>): ConditionResult {
  const left = ctx.resolve(data.leftOperand as string);
  const right = ctx.resolve(data.rightOperand as string);
  const operator = data.operator as string;

  let result: boolean;
  switch (operator) {
    case '==':
      result = left === right;
      break;
    case '!=':
      result = left !== right;
      break;
    case '>':
      result = Number(left) > Number(right);
      break;
    case '<':
      result = Number(left) < Number(right);
      break;
    case '>=':
      result = Number(left) >= Number(right);
      break;
    case '<=':
      result = Number(left) <= Number(right);
      break;
    case 'contains':
      result = left.includes(right);
      break;
    case 'startsWith':
      result = left.startsWith(right);
      break;
    case 'endsWith':
      result = left.endsWith(right);
      break;
    default:
      result = false;
  }

  return { handle: result ? 'true' : 'false' };
}
