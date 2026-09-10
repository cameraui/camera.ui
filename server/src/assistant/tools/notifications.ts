import { Severity } from '@camera.ui/sdk';
import { toolDefinition } from '@tanstack/ai';
import { container } from 'tsyringe';
import * as zod from 'zod';

import { takeSnapshot } from './cameras.js';
import { approvalSchema, DOWNLOAD_PATH, toolError } from './shared.js';

import type { ProxyServer } from '../../rpc/index.js';
import type { CoreTool, ToolContext } from './shared.js';

const sendNotificationInput = zod.object({
  title: zod.string().min(1).max(120),
  body: zod.string().max(1000).optional(),
  severity: zod.enum(['info', 'warn', 'error']).optional().describe('Default info'),
  camera: zod.string().optional().describe('Attach a fresh snapshot of this camera (name as returned by list_cameras)'),
  videoUrl: zod
    .string()
    .regex(DOWNLOAD_PATH, 'videoUrl must be a downloadUrl from export_clip')
    .optional()
    .describe('Attach a clip: the downloadUrl of an export_clip result. Phones show it as a video attachment.'),
});

const sendNotification = toolDefinition({
  name: 'send_notification',
  lazy: true,
  description:
    'Send a push notification to the devices of the user you are talking to, for example a summary they asked to receive on their phone. ' +
    'Pass camera to attach a fresh picture of it, or videoUrl from export_clip to attach a clip. Requires user confirmation.',
  needsApproval: true,
  inputSchema: approvalSchema(sendNotificationInput),
}).server<ToolContext['context']>(async (args, ctx) => {
  const parsed = sendNotificationInput.safeParse(args);
  if (!parsed.success) return toolError(`Invalid arguments: ${parsed.error.issues.map((i) => i.message).join(', ')}`);
  const { title, body, severity, camera, videoUrl } = parsed.data;
  const proxy = container.resolve<ProxyServer>('proxy');
  const manager = proxy.notificationManager;

  let thumbnail: Uint8Array | undefined;
  if (camera) {
    const snapshot = await takeSnapshot(camera);
    if ('error' in snapshot) return toolError(snapshot.error);
    thumbnail = new Uint8Array(snapshot.data);
  }

  const devices = await manager.listAllDevices(ctx.context.userId, ctx.context.role);
  const own = devices.filter((d) => d.ownerUserId === ctx.context.userId).map((d) => d.id);
  if (own.length === 0) return toolError('The user has no registered notification devices.');

  const results = await manager.notify({
    notification: { title, body, thumbnail, videoUrl, severity: severity === 'warn' ? Severity.Warn : severity === 'error' ? Severity.Error : Severity.Info },
    source: { kind: 'system', id: 'assistant' },
    targets: own,
  });

  const delivered = results.filter((r) => r.ok).length;
  return { ok: delivered > 0, devices: own.length, delivered, image: thumbnail ? camera : undefined, video: Boolean(videoUrl) };
});

export const notificationTools: CoreTool[] = [sendNotification];
