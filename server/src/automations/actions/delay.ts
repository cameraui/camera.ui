import type { ActionContext } from './types.js';

export async function actionDelay(_ctx: ActionContext, data: Record<string, unknown>): Promise<void> {
  const duration = data.duration as number;
  const unit = data.unit as string;
  const multiplier: Record<string, number> = { seconds: 1000, minutes: 60_000, hours: 3_600_000 };
  const ms = duration * (multiplier[unit] ?? 1000);
  await new Promise((resolve) => setTimeout(resolve, ms));
}
