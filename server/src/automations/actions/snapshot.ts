import type { ActionContext } from './types.js';

export async function actionSnapshot(ctx: ActionContext, data: Record<string, unknown>): Promise<void> {
  const camera = ctx.getCamera(data.cameraId as string);
  const source = camera.sources[0];
  if (!source) throw new Error(`Camera "${camera.name}" has no sources`);

  const forceNew = data.forceNew !== false;
  const snapshot = await camera.snapshot(source._id, forceNew);
  if (snapshot && snapshot.byteLength > 0) {
    const base64 = Buffer.from(snapshot).toString('base64');
    ctx.variables.set('snapshot', base64);
    ctx.variables.set('snapshot.base64', `data:image/jpeg;base64,${base64}`);
    ctx.variables.set('previous.result', 'snapshot_captured');
    ctx.variables.set('previous.success', 'true');
  } else {
    ctx.variables.set('previous.result', 'snapshot_failed');
    ctx.variables.set('previous.success', 'false');
  }
}
