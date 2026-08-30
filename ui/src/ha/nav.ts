import type { HomeAssistant } from './types.js';

export function panelPath(hass: HomeAssistant | undefined, entryId: string | undefined): string | null {
  if (!hass?.panels || !entryId) return null;
  const urlPath = `cameraui-${entryId}`;
  return urlPath in hass.panels ? `/${urlPath}` : null;
}

export function navigate(path: string): void {
  history.pushState(null, '', path);
  window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } }));
}
