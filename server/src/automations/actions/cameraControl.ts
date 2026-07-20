import { CamerasService } from '../../api/services/cameras.service.js';
import { parseValue } from '../parseValue.js';

import type { ActionContext } from './types.js';

let _camerasService: CamerasService | undefined;
const camerasService = (): CamerasService => (_camerasService ??= new CamerasService());

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function buildPatch(properties: { property: string; value: string }[], resolve: (s: string) => string): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  for (const { property, value } of properties) {
    const parts = property.split('.');
    if (parts.some((p) => UNSAFE_KEYS.has(p))) continue;
    const resolved = resolve(value);
    let current: any = patch;

    for (let i = 0; i < parts.length - 1; i++) {
      current[parts[i]] ??= {};
      current = current[parts[i]];
    }

    current[parts[parts.length - 1]] = parseValue(resolved);
  }

  return patch;
}

export async function actionCameraControl(ctx: ActionContext, data: Record<string, unknown>): Promise<void> {
  const cameraId = ctx.resolve(data.cameraId as string);
  const properties = (data.properties as { property: string; value: string }[]) ?? [];

  if (properties.length === 0) return;

  const camera = ctx.getCamera(cameraId);
  const patch = buildPatch(properties, ctx.resolve);

  await camerasService().patchCameraByName(camera.name, patch);

  if (!ctx.suppressVariableWrites) {
    ctx.variables.set('camera.id', cameraId);
    ctx.variables.set('camera.name', camera.name);
    ctx.variables.set('previous.success', 'true');
  }
}
