import { toolDefinition } from '@tanstack/ai';
import { container } from 'tsyringe';
import * as zod from 'zod';

import { CamerasService } from '../../api/services/cameras.service.js';
import { RoomsService } from '../../api/services/rooms.service.js';
import { SensorsService } from '../../api/services/sensors.service.js';
import { SENSOR_TYPE_CONFIG } from '../../sensors/types.js';
import { toolError, withImages } from './shared.js';

import type { CameraUiAPI } from '../../api.js';
import type { CoreTool, ToolContext } from './shared.js';

const SNAPSHOT_MAX_BYTES = 6 * 1024 * 1024;

function api(): CameraUiAPI {
  return container.resolve<CameraUiAPI>('api');
}

export function resolveCameraName(name: string): { id: string; name: string } | undefined {
  const cameras = new CamerasService().list();
  const needle = name.trim().toLowerCase();
  const exact = cameras.find((c) => c.name.toLowerCase() === needle || c._id === name);
  const match = exact ?? cameras.find((c) => c.name.toLowerCase().includes(needle));
  return match ? { id: match._id, name: match.name } : undefined;
}

const listCameras = toolDefinition({
  name: 'list_cameras',
  description:
    'List every camera with its room, online state and the detections currently active on it (motion, person, face, plate and so on). ' +
    'Call this first when a question names a camera or a room.',
  inputSchema: zod.object({}),
}).server<ToolContext['context']>(() => {
  const camerasService = new CamerasService();
  const rooms = new RoomsService();
  const sensors = new SensorsService();

  return camerasService.list().map((camera) => {
    const controller = api().getCamera(camera._id);
    const detections = sensors
      .list(camera._id)
      .filter((s) => s.connected && SENSOR_TYPE_CONFIG[s.type]?.isDetectionType)
      .map((s) => s.type);

    return {
      name: camera.name,
      room: rooms.label(camera.roomId) ?? camera.room ?? undefined,
      online: controller?.connected ?? false,
      disabled: camera.disabled,
      detections: Array.from(new Set(detections)),
      plugin: camera.pluginInfo?.name,
    };
  });
});

export async function takeSnapshot(camera: string): Promise<{ name: string; data: Buffer } | { error: string }> {
  const resolved = resolveCameraName(camera);
  if (!resolved) return { error: `No camera named "${camera}". Call list_cameras for the available names.` };

  const controller = api().getCamera(resolved.id);
  if (!controller) return { error: `Camera "${resolved.name}" is not running.` };
  if (!controller.connected) return { error: `Camera "${resolved.name}" is offline right now.` };

  const source = controller.preferredSnapshotSource ?? controller.streamSource;
  const snapshot = await controller.snapshot(source._id, true).catch(() => undefined);
  if (!snapshot || snapshot.byteLength === 0) return { error: `Camera "${resolved.name}" did not deliver a snapshot.` };
  if (snapshot.byteLength > SNAPSHOT_MAX_BYTES) return { error: `The snapshot of "${resolved.name}" is too large to transfer.` };

  return { name: resolved.name, data: Buffer.from(snapshot) };
}

const getCameraSnapshot = toolDefinition({
  name: 'get_camera_snapshot',
  description: 'Take a fresh still image from a camera and show it to the user. Use it for "what does the garden look like right now" questions.',
  inputSchema: zod.object({
    camera: zod.string().describe('Camera name as returned by list_cameras'),
  }),
}).server<ToolContext['context']>(async ({ camera }, ctx) => {
  const snapshot = await takeSnapshot(camera);
  if ('error' in snapshot) return toolError(snapshot.error);
  return withImages(`Snapshot of ${snapshot.name} taken just now.`, [{ data: snapshot.data.toString('base64'), mimeType: 'image/jpeg', caption: snapshot.name }], ctx);
});

export const cameraTools: CoreTool[] = [listCameras, getCameraSnapshot];
