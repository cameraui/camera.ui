import { Severity } from '@camera.ui/sdk';
import { toolDefinition } from '@tanstack/ai';
import { stat } from 'node:fs/promises';
import { container } from 'tsyringe';
import * as zod from 'zod';

import { takeSnapshot } from './cameras.js';
import { eventPicture } from './plugins.js';
import { approvalSchema, DOWNLOAD_PATH, toolError } from './shared.js';

import type { ProxyServer } from '../../rpc/index.js';
import type { AssistantToolRegistry } from '../registry.js';
import type { CoreTool, ToolContext } from './shared.js';

const PUSH_VIDEO_MAX_BYTES = 5 * 1024 * 1024;

const sendNotificationInput = zod.object({
  title: zod.string().min(1).max(120),
  body: zod.string().max(1000).optional(),
  severity: zod.enum(['info', 'warn', 'error']).optional().describe('Default info'),
  eventId: zod
    .string()
    .optional()
    .describe('Attach the picture of this event, the id from query_events or get_event_image. Use it for a moment already found in the conversation.'),
  camera: zod
    .string()
    .optional()
    .describe('Attach a picture of this camera taken right now (name as returned by list_cameras). Only for the live picture, never for a past moment.'),
  videoUrl: zod
    .string()
    .regex(DOWNLOAD_PATH, 'videoUrl must be a downloadUrl from export_clip')
    .optional()
    .describe('Attach a clip: the downloadUrl of export_clip called with push true. Pass the same eventId, so the push shows the picture of that moment.'),
});

export function createNotificationTools(registry: AssistantToolRegistry): CoreTool[] {
  const sendNotification = toolDefinition({
    name: 'send_notification',
    lazy: true,
    description:
      'Send a push notification to the devices of the user you are talking to, for example a summary they asked to receive on their phone. ' +
      'Pass eventId to attach the picture of a moment, camera for a picture taken right now, or videoUrl from export_clip for a short clip. Requires user confirmation.',
    needsApproval: true,
    inputSchema: approvalSchema(sendNotificationInput),
  }).server<ToolContext['context']>(async (args, ctx) => {
    const parsed = sendNotificationInput.safeParse(args);
    if (!parsed.success) return toolError(`Invalid arguments: ${parsed.error.issues.map((i) => i.message).join(', ')}`);
    const { title, body, severity, eventId, camera, videoUrl } = parsed.data;
    const proxy = container.resolve<ProxyServer>('proxy');
    const manager = proxy.notificationManager;

    const videoToken = videoUrl?.slice(videoUrl.lastIndexOf('/') + 1);
    if (videoToken) {
      const file = proxy.downloadManager.resolveLocalFile(videoToken);
      const size = file ? (await stat(file).catch(() => undefined))?.size : undefined;
      if (size !== undefined && size > PUSH_VIDEO_MAX_BYTES) {
        // prettier-ignore
        return toolError(
          `The clip has ${Math.ceil(size / 1024 / 1024)} MB, a phone cannot load that in a push. ` +
          'Call export_clip with the eventId and push true for a short clip and send that one.',
        );
      }
    }

    let thumbnail: Uint8Array | undefined;
    if (eventId) {
      const picture = await eventPicture(registry, eventId, ctx);
      if ('error' in picture) return toolError(picture.error);
      thumbnail = new Uint8Array(picture.data);
    } else if (camera) {
      const snapshot = await takeSnapshot(camera);
      if ('error' in snapshot) return toolError(snapshot.error);
      thumbnail = new Uint8Array(snapshot.data);
    }

    const devices = await manager.listAllDevices(ctx.context.userId, ctx.context.role);
    const own = devices.filter((d) => d.ownerUserId === ctx.context.userId).map((d) => d.id);
    if (own.length === 0) return toolError('The user has no registered notification devices.');

    const results = await manager.notify({
      notification: {
        title,
        body,
        thumbnail,
        videoUrl: videoToken ? proxy.downloadManager.publicUrl(videoToken) || videoUrl : undefined,
        severity: severity === 'warn' ? Severity.Warn : severity === 'error' ? Severity.Error : Severity.Info,
      },
      source: { kind: 'system', id: 'assistant' },
      targets: own,
    });

    const delivered = results.filter((r) => r.ok).length;
    return { ok: delivered > 0, devices: own.length, delivered, image: eventId ?? camera, video: Boolean(videoUrl) };
  });

  return [sendNotification];
}
