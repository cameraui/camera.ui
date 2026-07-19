export function runtimeBase(): string {
  const raw = typeof window !== 'undefined' ? window.__CUI_BASE__ : undefined;
  if (!raw || !raw.startsWith('/')) return '/';
  return raw.endsWith('/') ? raw : `${raw}/`;
}

export function isEmbedded(): boolean {
  return runtimeBase() !== '/';
}

export function homeOrigin(): string {
  const base = runtimeBase();
  if (base === '/') return window.location.origin;
  return new URL(base, window.location.origin).href.replace(/\/$/, '');
}

export function embedHost(): string | null {
  const raw = typeof window !== 'undefined' ? window.__CUI_EMBED__ : undefined;
  return raw ? raw : null;
}

export function isHomeAssistant(): boolean {
  return embedHost() === 'homeassistant';
}
