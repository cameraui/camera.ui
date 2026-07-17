import { IS_DEV, IS_ELECTRON } from '@camera.ui/common/utils';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ELECTRON_ASAR_UNPACKED } from '../services/config/constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const JS_EXT = IS_DEV && !IS_ELECTRON ? 'ts' : 'js';

export const pythonPath = resolve(join(__dirname, '..')).replace('app.asar', ELECTRON_ASAR_UNPACKED);

export const serverRequirementsPath = resolve(join(__dirname, '..', '..', 'requirements.txt')).replace('app.asar', ELECTRON_ASAR_UNPACKED);

export const pythonDecoderPath = resolve(join(__dirname, '..', 'camera', 'decoder', 'python', 'child.py')).replace('app.asar', ELECTRON_ASAR_UNPACKED);
export const pythonPluginPath = resolve(join(__dirname, '..', 'plugins', 'runtime', 'python', 'child.py')).replace('app.asar', ELECTRON_ASAR_UNPACKED);

export const nodeDecoderPath = resolve(join(__dirname, '..', 'camera', 'decoder', `child.${JS_EXT}`)).replace('app.asar', ELECTRON_ASAR_UNPACKED);
export const nodePluginPath = resolve(join(__dirname, '..', 'plugins', 'runtime', 'node', `child.${JS_EXT}`)).replace('app.asar', ELECTRON_ASAR_UNPACKED);
