import type { ActionContext } from '../actions/types.js';

export type ConditionResult = { handle: string } | null;

export type ConditionHandler = (ctx: ActionContext, data: Record<string, unknown>) => Promise<ConditionResult> | ConditionResult;
