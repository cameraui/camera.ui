import { Decoder, Demuxer, Scaler } from 'node-av/api';
import { AV_CODEC_ID_MJPEG, AV_FRAME_FLAG_CORRUPT } from 'node-av/constants';
import { Codec, CodecContext, Dictionary, Frame, Packet, Rational } from 'node-av/lib';

const MAX_LOWRES = 3;

let jpegScaler: Scaler | undefined;
let jpegQueue: Promise<unknown> = Promise.resolve();

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

export function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

export function scaleJpeg(jpeg: ArrayBuffer, maxWidth: number, quality: number): Promise<ArrayBuffer | undefined> {
  const bytes = new Uint8Array(jpeg);
  const size = jpegSize(bytes);
  if (!size || size.width <= maxWidth) return Promise.resolve(undefined);
  const run = jpegQueue.then(() => decodeScaled(bytes, size.width, maxWidth, quality));
  jpegQueue = run.catch(() => undefined);
  return run;
}

export async function squarePng(input: string | Buffer, size: number): Promise<Buffer | null> {
  using scaler = new Scaler();
  const png = await withPicture(input, async (frame) => {
    const side = Math.min(frame.width, frame.height) & ~1;
    if (side < 2) return null;

    const crop = { x: ((frame.width - side) / 2) & ~1, y: ((frame.height - side) / 2) & ~1, width: side, height: side };
    return await scaler.toPng(frame, { crop, resize: { width: size, height: size }, format: 'rgba' });
  });
  return png ?? null;
}

export async function withPicture<T>(input: string | Buffer, use: (frame: Frame) => Promise<T>): Promise<T | undefined> {
  await using demuxer = await Demuxer.open(input);
  const stream = demuxer.video();
  if (!stream) return undefined;

  using decoder = await Decoder.create(stream, { exitOnError: false });
  for await (using frame of decoder.frames(demuxer.packets(stream.index))) {
    if (frame && !isDamagedFrame(frame)) return await use(frame);
  }
  return undefined;
}

async function decodeScaled(jpeg: Uint8Array, width: number, maxWidth: number, quality: number): Promise<ArrayBuffer | undefined> {
  const codec = Codec.findDecoder(AV_CODEC_ID_MJPEG);
  if (!codec) return undefined;

  using context = new CodecContext();
  context.allocContext3(codec);
  let lowres = 0;
  while (lowres < MAX_LOWRES && width >> (lowres + 1) >= maxWidth) lowres++;
  if ((await context.open2(codec, lowres ? Dictionary.fromObject({ lowres }) : null)) < 0) return undefined;

  using packet = new Packet();
  packet.alloc();
  packet.data = Buffer.from(jpeg.buffer, jpeg.byteOffset, jpeg.byteLength);
  using frame = new Frame();
  frame.alloc();
  if ((await context.sendPacket(packet)) < 0) return undefined;
  await context.sendPacket(null);
  if ((await context.receiveFrame(frame)) < 0 || isDamagedFrame(frame)) return undefined;

  frame.timeBase = new Rational(1, 1);
  const outWidth = maxWidth & ~1;
  const outHeight = Math.max(2, Math.round((frame.height * outWidth) / frame.width) & ~1);
  jpegScaler ??= new Scaler();
  return toArrayBuffer(await jpegScaler.toJpeg(frame, { resize: { width: outWidth, height: outHeight }, quality }));
}

export function isDamagedFrame(frame: Frame): boolean {
  return frame.decodeErrorFlags !== 0 || frame.hasFlags(AV_FRAME_FLAG_CORRUPT);
}
