import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

for (const file of ['.env.local', '.env']) {
  const path = resolve(join(__dirname, '../../..', file));
  if (existsSync(path)) {
    process.loadEnvFile(path);
  }
}
