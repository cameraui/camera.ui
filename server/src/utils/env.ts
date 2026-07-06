import { config } from 'dotenv';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: resolve(join(__dirname, '../../../.env.local')), quiet: true });
config({ path: resolve(join(__dirname, '../../../.env')), quiet: true });
