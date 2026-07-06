import type { ActionContext } from '../actions/types.js';

export function actionOutput(ctx: ActionContext, data: Record<string, unknown>): void {
  const vars = (data.variables as { label: string; value: string }[]) ?? [];
  const entries: Record<string, string> = {};

  for (const v of vars) {
    entries[v.label || v.value] = ctx.resolve(v.value);
  }

  ctx.variables.set('output', JSON.stringify(entries));
  ctx.variables.set('previous.success', 'true');
}
