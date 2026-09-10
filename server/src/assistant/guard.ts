import { contentGuardMiddleware } from '@tanstack/ai/middlewares';

import type { ChatMiddleware } from '@tanstack/ai';
import type { LoggerService } from '../services/logger/index.js';

const RULES = [
  { pattern: /(\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:)[^\s@/]+(@)/gi, replacement: '$1***$2' },
  { pattern: /\bcui_[A-Za-z0-9_-]{20,}/g, replacement: 'cui_***' },
  { pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, replacement: '***' },
  { pattern: /\b(?:sk|rk)-[A-Za-z0-9_-]{20,}/g, replacement: 'sk-***' },
  { pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g, replacement: 'AIza***' },
  { pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}/g, replacement: 'gh_***' },
  {
    pattern: /((?:password|passwd|passphrase|secret|api[_ -]?key|access[_ -]?token|passwort|kennwort)\s*["'`]?\s*[:=]\s*["'`]?)(?!\*{3})[^\s"'`,;)]+/gi,
    replacement: '$1***',
  },
];

const BUFFER_SIZE = 96;

export function secretGuard(logger: LoggerService): ChatMiddleware {
  return contentGuardMiddleware({
    rules: RULES,
    strategy: 'buffered',
    bufferSize: BUFFER_SIZE,
    onFiltered: () => logger.debug('Assistant: redacted a secret from the answer'),
  });
}
