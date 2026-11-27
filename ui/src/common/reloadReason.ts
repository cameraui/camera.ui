const REASON_KEY = 'cui-reload-reason';
const ALIVE_KEY = 'cui-page-alive';

export function noteReload(reason: string | null): void {
  try {
    if (reason) sessionStorage.setItem(REASON_KEY, reason);
    else sessionStorage.removeItem(REASON_KEY);
  } catch {
    // ignore
  }
}

export function reloadFromMenu(): void {
  noteReload('from the menu');
  window.location.reload();
}

export function logLastReload(): void {
  const log = useLogger('Page');
  try {
    const reason = sessionStorage.getItem(REASON_KEY);
    const unloaded = !sessionStorage.getItem(ALIVE_KEY);
    sessionStorage.removeItem(REASON_KEY);
    sessionStorage.setItem(ALIVE_KEY, '1');
    if (reason) log.info(`reloaded ${reason}`);
    else if (!unloaded) log.warn('the previous page ended without unloading, the browser or system restarted it');
  } catch {
    return;
  }

  window.addEventListener('pagehide', () => sessionStorage.removeItem(ALIVE_KEY));
  window.addEventListener('pageshow', () => sessionStorage.setItem(ALIVE_KEY, '1'));
}
