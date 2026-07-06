import { actionImageInput } from './imageInput.js';
import { actionOutput } from './output.js';

import type { ActionHandler } from '../actions/types.js';

export const UTILITY_HANDLERS: Record<string, ActionHandler> = {
  'action-image-input': actionImageInput,
  'action-output': actionOutput,
};
