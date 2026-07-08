// Values must round-trip identically through all three runtimes' msgpack
// codecs — anything outside the shared domain is refused up front.
// Depth cap: rejects circular references (and absurd nesting) with a clear
// error instead of a stack overflow.
const MAX_DEPTH = 64;

export function validateStoreValue(key: string, value: unknown): void {
  walk(value, key, 0);
}

function walk(value: unknown, path: string, depth: number): void {
  if (depth > MAX_DEPTH) {
    throw new Error(`store: value at '${path}' exceeds ${MAX_DEPTH} nesting levels — circular reference?`);
  }
  if (value === null || value === undefined) {
    return;
  }

  switch (typeof value) {
    case 'number':
      if (Number.isNaN(value) || !Number.isFinite(value)) {
        throw new Error(`store: value at '${path}' is ${value} — NaN/Infinity are not storable`);
      }
      if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
        throw new Error(`store: value at '${path}' exceeds the float64-safe integer range (±2^53)`);
      }
      return;
    case 'string':
    case 'boolean':
      return;
    case 'bigint':
      throw new Error(`store: value at '${path}' is a BigInt — numbers are float64 by contract`);
    case 'function':
      throw new Error(`store: value at '${path}' is a function`);
  }

  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
    throw new Error(`store: value at '${path}' is binary — large artifacts belong in files under the plugin storage dir`);
  }

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      walk(value[i], `${path}[${i}]`, depth + 1);
    }
    return;
  }

  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    throw new Error(`store: value at '${path}' is a ${value.constructor?.name ?? 'non-plain'} instance — only plain objects are storable`);
  }

  for (const [key, entry] of Object.entries(value)) {
    walk(entry, `${path}.${key}`, depth + 1);
  }
}
