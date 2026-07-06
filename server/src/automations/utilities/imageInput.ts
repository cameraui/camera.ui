import { Decoder, Demuxer, Scaler } from 'node-av/api';

import type { ActionContext } from '../actions/types.js';

export async function actionImageInput(ctx: ActionContext, data: Record<string, unknown>): Promise<void> {
  const source = ctx.resolve(data.source as string);
  if (!source) throw new Error('Image source is required');

  const resizeWidth = (data.resizeWidth as number) || 0;
  const resizeHeight = (data.resizeHeight as number) || 0;
  const outputFormat = (data.outputFormat as string) || 'jpeg';
  const isUrl = source.startsWith('http://') || source.startsWith('https://');
  const needsTransform = resizeWidth > 0 || resizeHeight > 0 || outputFormat !== 'jpeg';

  if (!needsTransform) {
    let base64: string;
    if (isUrl) {
      const res = await fetch(source);
      if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
      base64 = Buffer.from(await res.arrayBuffer()).toString('base64');
    } else {
      base64 = source;
    }
    const varName = (data.variableName as string) || 'image';
    ctx.variables.set(varName, base64);
    ctx.variables.set(`${varName}.format`, 'jpeg');
    ctx.variables.set('previous.success', 'true');
    ctx.variables.set('previous.result', varName);
    return;
  }

  const input = isUrl ? source : Buffer.from(source, 'base64');
  using demuxer = await Demuxer.open(input, isUrl ? { options: { user_agent: 'camera.ui' } } : undefined);
  const videoStream = demuxer.video();
  if (!videoStream) throw new Error('No image data found in source');

  using decoder = await Decoder.create(videoStream, { exitOnError: false });
  using scaler = new Scaler();

  let resultBuffer: Buffer | undefined;
  let resultWidth = 0;
  let resultHeight = 0;

  for await (using frame of decoder.frames(demuxer.packets(videoStream.index))) {
    if (!frame) continue;

    const width = resizeWidth || frame.width;
    const height = resizeHeight || frame.height;
    const resize = { width, height };

    if (outputFormat === 'jpeg') {
      resultBuffer = await scaler.toJpeg(frame, { resize, quality: 90 });
    } else {
      const format = outputFormat === 'raw-gray' ? 'gray' : outputFormat === 'raw-rgba' ? 'rgba' : 'rgb';
      resultBuffer = await scaler.toBuffer(frame, { resize, format });
    }
    resultWidth = width;
    resultHeight = height;
    break;
  }

  if (!resultBuffer) throw new Error('Failed to process image');

  const varName = (data.variableName as string) || 'image';
  ctx.variables.set(varName, resultBuffer.toString('base64'));
  ctx.variables.set(`${varName}.width`, String(resultWidth));
  ctx.variables.set(`${varName}.height`, String(resultHeight));
  ctx.variables.set(`${varName}.format`, outputFormat);
  ctx.variables.set('previous.success', 'true');
  ctx.variables.set('previous.result', varName);
}
