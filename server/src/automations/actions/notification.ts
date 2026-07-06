import { Severity } from '@camera.ui/sdk';
import { container } from 'tsyringe';

import type { Notification } from '@camera.ui/sdk';
import type { ProxyServer } from '../../rpc/index.js';
import type { ActionContext } from './types.js';

const VALID_SEVERITIES = new Set<string>(Object.values(Severity));

export async function actionNotification(ctx: ActionContext, data: Record<string, unknown>): Promise<void> {
  const title = ctx.resolve((data.title as string) ?? '').trim();
  if (!title) {
    ctx.logger.warn(`[automation:${ctx.flowName}] action-notification skipped — title is required`);
    return;
  }

  const body = ctx.resolve((data.body as string) ?? '');
  const deepLink = ctx.resolve((data.deepLink as string) ?? '');
  const severity = normaliseSeverity(data.severity);
  const thumbnail = await fetchThumbnail(ctx, data);

  const notification: Notification = {
    title,
    body: body || undefined,
    severity,
    deepLink: deepLink || undefined,
    thumbnail,
    tag: `automation:${ctx.flowId}`,
  };

  const targets = normaliseTargets(data.targets);
  const proxyServer = container.resolve<ProxyServer>('proxy');

  await proxyServer.notificationManager.notify({
    notification,
    source: { kind: 'automation', id: ctx.flowId },
    targets,
  });
}

async function fetchThumbnail(ctx: ActionContext, data: Record<string, unknown>): Promise<Uint8Array | undefined> {
  const raw = ctx.resolve((data.image as string) ?? '').trim();
  if (!raw) return undefined;

  try {
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      const res = await fetch(raw);
      if (!res.ok) {
        ctx.logger.warn(`[automation:${ctx.flowName}] action-notification image fetch failed: ${res.status}`);
        return undefined;
      }
      return new Uint8Array(await res.arrayBuffer());
    }

    // Inline payload — strip a `data:image/...;base64,` prefix when present,
    // otherwise treat the value as raw base64 (the convention used by
    // action-image-input and action-snapshot when they store under variables).
    const comma = raw.startsWith('data:') ? raw.indexOf(',') : -1;
    const b64 = comma >= 0 ? raw.slice(comma + 1) : raw;
    const buf = Buffer.from(b64, 'base64');
    return buf.byteLength > 0 ? new Uint8Array(buf) : undefined;
  } catch (err) {
    ctx.logger.warn(`[automation:${ctx.flowName}] action-notification image decode failed: ${(err as Error).message}`);
    return undefined;
  }
}

function normaliseSeverity(raw: unknown): Severity {
  if (typeof raw !== 'string') return Severity.Info;
  return VALID_SEVERITIES.has(raw) ? (raw as Severity) : Severity.Info;
}

function normaliseTargets(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const ids = raw
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string') {
        return (item as { id: string }).id;
      }
      return null;
    })
    .filter((id): id is string => id !== null && id.length > 0);
  return ids.length > 0 ? ids : undefined;
}
