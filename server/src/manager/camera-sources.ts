import { patchCameraSchema } from '../api/schemas/cameras.schema.js';
import { inject } from '../container.js';

import type { Camera, CameraConfigInputSettings } from '@camera.ui/sdk';
import type { CameraInputSettings } from '@camera.ui/sdk/internal';
import type { CamerasService } from '../api/services/cameras.service.js';
import type { CameraSourceChange } from '../rpc/interfaces/device.js';

/** The source fields a camera patch accepts, in the order the schema lists them. */
const SOURCE_FIELDS = [
  'name',
  'role',
  'useForSnapshot',
  'hotMode',
  'preload',
  'muted',
  'backchannelDisabled',
  'onvifDisabled',
  'timeout',
  'handshakeTimeout',
  'urls',
  'childSourceId',
  'childCameraId',
  'childCameraRole',
] as const satisfies readonly (keyof CameraInputSettings)[];

type SourceInput = Partial<Pick<CameraInputSettings, (typeof SOURCE_FIELDS)[number]>>;

/**
 * Add a source to a camera on behalf of the plugin that controls it.
 * The source goes through the same validation as a camera patch from the UI, so names stay unique,
 * each role is used once and at most one source is used for snapshots. A source without URLs is served
 * by the plugin through `streamUrl()`, as on adoption.
 */
export async function addCameraSource(
  camerasService: CamerasService,
  pluginId: string,
  cameraId: string,
  source: CameraConfigInputSettings,
): Promise<CameraSourceChange> {
  const camera = ownedCamera(camerasService, pluginId, cameraId);

  const added: SourceInput = { ...pickSourceFields(source), urls: source.urls?.length ? source.urls : ['cui://127.0.0.1'] };
  const sources = parseSources([...camera.sources.map(pickSourceFields), added]);

  // the schema normalizes the name, so read it back before building the plugin stream URL
  const addedSource = sources[sources.length - 1];
  if (addedSource.urls.length === 1 && addedSource.urls[0].startsWith('cui://')) {
    const port = inject('configService').config.port;
    addedSource.urls = [`cui://127.0.0.1:${port}/api/cameras/streams/${camera._id}/${addedSource.name}`];
  }

  const updated = await applySources(camerasService, camera.name, cameraId, sources);
  const sourceId = updated.sources.find((item) => item.name === addedSource.name)?._id;
  if (!sourceId) {
    throw new Error(`Source "${addedSource.name}" was not saved`);
  }

  return { camera: updated, sourceId };
}

/**
 * Remove a source from a camera on behalf of the plugin that controls it.
 * The camera has to keep at least one high, mid or low resolution source.
 */
export async function removeCameraSource(camerasService: CamerasService, pluginId: string, cameraId: string, sourceId: string): Promise<CameraSourceChange> {
  const camera = ownedCamera(camerasService, pluginId, cameraId);

  const remaining = camera.sources.filter((source) => source._id !== sourceId);
  if (remaining.length === camera.sources.length) {
    throw new Error(`Source "${sourceId}" not found on camera "${camera.name}"`);
  }

  const sources = parseSources(remaining.map(pickSourceFields));
  const updated = await applySources(camerasService, camera.name, cameraId, sources);

  return { camera: updated };
}

function ownedCamera(camerasService: CamerasService, pluginId: string, cameraId: string) {
  const camera = camerasService.findById(cameraId);
  if (!camera) {
    throw new Error(`Camera "${cameraId}" not found`);
  }

  if (!pluginId || camera.pluginInfo?.id !== pluginId) {
    throw new Error(`Only the plugin that controls camera "${camera.name}" can change its sources`);
  }

  return camera;
}

function pickSourceFields(source: SourceInput): SourceInput {
  const picked: SourceInput = {};
  for (const field of SOURCE_FIELDS) {
    if (source[field] !== undefined) Object.assign(picked, { [field]: source[field] });
  }
  return picked;
}

function parseSources(sources: SourceInput[]) {
  const parsed = patchCameraSchema.safeParse({ sources });
  if (!parsed.success) {
    throw new Error(`Invalid sources: ${parsed.error.issues.map((issue) => issue.message).join(', ')}`);
  }
  return parsed.data.sources ?? [];
}

async function applySources(
  camerasService: CamerasService,
  cameraName: string,
  cameraId: string,
  sources: NonNullable<ReturnType<typeof parseSources>>,
): Promise<Camera> {
  await camerasService.patchCameraByName(cameraName, { sources });

  const updated = camerasService.findTransformedById(cameraId);
  if (!updated) {
    throw new Error(`Camera "${cameraId}" not found after the change`);
  }

  return updated;
}
