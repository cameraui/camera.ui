import { Decoder, Demuxer, Scaler } from 'node-av/api';

export function jpegSize(jpeg: Uint8Array): { width: number; height: number } | undefined {
  const view = new DataView(jpeg.buffer, jpeg.byteOffset, jpeg.byteLength);
  let i = 2;
  while (i + 9 < jpeg.length) {
    if (jpeg[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = jpeg[i + 1];
    if (marker === 0xff) {
      i++;
      continue;
    }
    // SOF0-SOF15 carry the frame size, skip DHT (C4), JPG (C8), DAC (CC)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { width: view.getUint16(i + 7), height: view.getUint16(i + 5) };
    }
    i += 2 + view.getUint16(i + 2);
  }
  return undefined;
}

export async function squarePng(input: string | Buffer, size: number): Promise<Buffer | null> {
  await using demuxer = await Demuxer.open(input);
  const stream = demuxer.video();
  if (!stream) return null;

  using decoder = await Decoder.create(stream, { exitOnError: false });
  using scaler = new Scaler();

  for await (using frame of decoder.frames(demuxer.packets(stream.index))) {
    if (!frame) continue;

    const side = Math.min(frame.width, frame.height) & ~1;
    if (side < 2) return null;

    const crop = { x: ((frame.width - side) / 2) & ~1, y: ((frame.height - side) / 2) & ~1, width: side, height: side };
    return await scaler.toPng(frame, { crop, resize: { width: size, height: size }, format: 'rgba' });
  }

  return null;
}
