#!/usr/bin/env node

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const mainFilePath = resolve(join(__dirname, '../src/main.js'));

await import(mainFilePath);
