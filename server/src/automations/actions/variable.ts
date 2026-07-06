import type { ActionContext } from './types.js';

export function actionVariable(ctx: ActionContext, data: Record<string, unknown>): void {
  const varName = data.variableName as string;
  const operator = (data.operator as string) ?? '=';
  const resolved = ctx.resolve(data.value as string);

  if (operator === '+=') {
    const current = Number(ctx.variables.get(varName) ?? '0');
    ctx.variables.set(varName, String(current + Number(resolved)));
  } else if (operator === '-=') {
    const current = Number(ctx.variables.get(varName) ?? '0');
    ctx.variables.set(varName, String(current - Number(resolved)));
  } else {
    ctx.variables.set(varName, resolved);
  }
}
