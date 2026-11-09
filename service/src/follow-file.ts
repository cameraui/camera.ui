import { createReadStream, existsSync, statSync, unwatchFile, watchFile } from 'node:fs';

import type { Stats } from 'node:fs';

const WATCH_INTERVAL = 100;

export function followFile(path: string, onLine: (line: string) => void): () => void {
  let cursor = existsSync(path) ? statSync(path).size : 0;
  let target = cursor;
  let remainder = '';
  let reading = false;
  let restarts = 0;

  const pump = (): void => {
    if (reading || target <= cursor) {
      return;
    }

    reading = true;
    const end = target;
    const restart = restarts;
    const stream = createReadStream(path, { start: cursor, end: end - 1, encoding: 'utf8' });

    stream.on('data', (chunk) => {
      const lines = (remainder + String(chunk)).split(/\r?\n/);
      remainder = lines.pop() ?? '';

      for (const line of lines) {
        onLine(line);
      }
    });

    stream.on('end', () => {
      if (restart === restarts) cursor = end;
      reading = false;
      pump();
    });

    stream.on('error', () => {
      reading = false;
    });
  };

  const onChange = (current: Stats, previous: Stats): void => {
    if (current.ino !== previous.ino || current.size < cursor) {
      cursor = 0;
      remainder = '';
      restarts++;
    }

    target = current.size;
    pump();
  };

  watchFile(path, { interval: WATCH_INTERVAL }, onChange);

  return () => unwatchFile(path, onChange);
}
