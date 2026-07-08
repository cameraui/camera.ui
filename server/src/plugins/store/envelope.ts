import { Packr } from 'msgpackr';
import { crc32 } from 'node:zlib';

// Standard msgpack only — records/string bundles are msgpackr-proprietary and
// unreadable by the Go/Python sides; int64AsType keeps foreign integers in
// the float64 number domain instead of surfacing as BigInt.
const packr = new Packr({ useRecords: false, bundleStrings: false, int64AsType: 'number' });

const MAGIC = Buffer.from('CUI1');

export class StoreCorruptError extends Error {
  constructor(message: string) {
    super(`store envelope: ${message}`);
    this.name = 'StoreCorruptError';
  }
}

export function encodeEnvelope(payload: Record<string, any>): Buffer {
  const body = packr.pack(payload);
  const crc = Buffer.allocUnsafe(4);
  crc.writeUInt32LE(crc32(body) >>> 0);
  return Buffer.concat([MAGIC, body, crc]);
}

export function decodeEnvelope(buf: Buffer): Record<string, any> {
  if (buf.length < MAGIC.length + 4 || !buf.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new StoreCorruptError('bad magic');
  }

  const body = buf.subarray(MAGIC.length, buf.length - 4);
  if (crc32(body) >>> 0 !== buf.readUInt32LE(buf.length - 4)) {
    throw new StoreCorruptError('crc mismatch');
  }

  let payload: unknown;
  try {
    payload = packr.unpack(body);
  } catch (error) {
    throw new StoreCorruptError(`payload decode failed: ${error instanceof Error ? error.message : error}`);
  }

  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new StoreCorruptError('payload is not a map');
  }

  return payload as Record<string, any>;
}
