import { createEmptyContext } from '../context.js';

import type { DBAutomation, DBAutomationNode } from '../../api/database/types.js';
import type { TriggerContext } from './types.js';

export function scheduleTimer(ctx: TriggerContext, flow: DBAutomation, triggerNode: DBAutomationNode): void {
  const cron = triggerNode.data.cron as string;
  if (!cron) return;

  // Align to next full minute, then check every 60s
  const msUntilNextMinute = 60_000 - (Date.now() % 60_000);
  let lastCheckedMinute = -1;

  const check = () => {
    const now = new Date();
    const currentMinute = now.getMinutes() + now.getHours() * 60 + now.getDate() * 1440;

    if (currentMinute === lastCheckedMinute) return;
    lastCheckedMinute = currentMinute;

    if (matchesCron(cron)) {
      ctx.executeFlow(flow, triggerNode, createEmptyContext());
    }
  };

  const alignTimer = setTimeout(() => {
    check();
    const interval = setInterval(check, 60_000);
    ctx.addSchedule(flow._id, interval);
  }, msUntilNextMinute);

  ctx.addSchedule(flow._id, alignTimer);
}

function matchesCron(cron: string): boolean {
  const now = new Date();
  const parts = cron.split(' ');
  if (parts.length < 5) return false;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  return (
    matchCronField(minute, now.getMinutes()) &&
    matchCronField(hour, now.getHours()) &&
    matchCronField(dayOfMonth, now.getDate()) &&
    matchCronField(month, now.getMonth() + 1) &&
    matchCronField(dayOfWeek, now.getDay())
  );
}

function matchCronField(field: string, value: number): boolean {
  if (field === '*') return true;
  if (field.includes('/')) {
    const [, step] = field.split('/');
    return value % Number(step) === 0;
  }
  if (field.includes(',')) {
    return field.split(',').some((v) => Number(v) === value);
  }
  if (field.includes('-')) {
    const [min, max] = field.split('-').map(Number);
    return value >= min && value <= max;
  }
  return Number(field) === value;
}
