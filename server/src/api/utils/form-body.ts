export type FormBody = Record<string, string | string[]>;

export function parseFormBody(body: string): FormBody {
  const values = new Map<string, string | string[]>();

  for (const [key, value] of new URLSearchParams(body)) {
    const existing = values.get(key);

    if (existing === undefined) {
      values.set(key, value);
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      values.set(key, [existing, value]);
    }
  }

  const parsed: FormBody = {};
  for (const [key, value] of values) {
    // defineProperty keeps a "__proto__" field an own property
    Object.defineProperty(parsed, key, { value, enumerable: true, writable: true, configurable: true });
  }

  return parsed;
}
