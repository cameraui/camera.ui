import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

let placeholder: Promise<ArrayBuffer> | undefined;

export function privacyPlaceholder(): Promise<ArrayBuffer> {
  placeholder ??= readFile(fileURLToPath(new URL('./media/privacy.jpg', import.meta.url))).then((data) => new Uint8Array(data).buffer);
  return placeholder;
}
