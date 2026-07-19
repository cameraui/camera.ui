import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { container } from 'tsyringe';

import type { ConfigService } from '../services/config/index.js';

const BASE_RE = /^\/[A-Za-z0-9/_-]*\/$/;
const EMBED_HOSTS = new Set(['homeassistant']);
const rendered = new Map<string, string>();
let rawHtml: string | undefined;

function raw(): string {
  if (rawHtml === undefined) {
    const config = container.resolve<ConfigService>('configService');
    rawHtml = readFileSync(join(config.INTERFACE_CACHE_PATH, 'index.html'), 'utf8');
  }
  return rawHtml;
}

export function normalizeBase(header: string | string[] | undefined): string {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) return '/';
  const withSlash = value.endsWith('/') ? value : `${value}/`;
  return BASE_RE.test(withSlash) ? withSlash : '/';
}

export function normalizeEmbed(header: string | string[] | undefined): string {
  const value = Array.isArray(header) ? header[0] : header;
  return value && EMBED_HOSTS.has(value) ? value : '';
}

export function renderIndexHtml(base: string, embed = ''): string {
  const key = `${base}\n${embed}`;
  const cached = rendered.get(key);
  if (cached) return cached;

  const html = raw()
    .replace(/((?:src|href)=")\.\//g, `$1${base}`)
    .replace(/window\.__CUI_BASE__\s*=\s*'[^']*'/, `window.__CUI_BASE__ = '${base}'`)
    .replace(/window\.__CUI_EMBED__\s*=\s*'[^']*'/, `window.__CUI_EMBED__ = '${embed}'`);
  if (rendered.size < 16) rendered.set(key, html);
  return html;
}
