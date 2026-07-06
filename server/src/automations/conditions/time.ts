import type { ActionContext } from '../actions/types.js';
import type { ConditionResult } from './types.js';

export function conditionTime(_ctx: ActionContext, data: Record<string, unknown>): ConditionResult {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const startTime = data.startTime as string;
  const endTime = data.endTime as string;
  const days = (data.days as number[]) ?? [];

  if (days.length > 0 && !days.includes(now.getDay())) {
    return { handle: 'false' };
  }

  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  let inRange: boolean;
  if (startMinutes <= endMinutes) {
    inRange = currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  } else {
    // Overnight range: e.g. 22:00 - 06:00
    inRange = currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  }

  return { handle: inRange ? 'true' : 'false' };
}
