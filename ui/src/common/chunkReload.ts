const KEY = 'cui-chunk-reload';
const MAX_RELOADS = 2;
const STABLE_MS = 8000;

export function attemptChunkReload(reload: () => void): void {
  const count = Number(sessionStorage.getItem(KEY) ?? '0') || 0;
  if (count >= MAX_RELOADS) return;
  sessionStorage.setItem(KEY, String(count + 1));
  reload();
}

export function markLoadStable(ms = STABLE_MS): void {
  setTimeout(() => sessionStorage.removeItem(KEY), ms);
}
