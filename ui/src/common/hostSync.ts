import { isHomeAssistant } from '@/common/base.js';

import type { SupportedThemes } from '@shared/types';

interface HostSyncHandlers {
  onTheme?: (mode: SupportedThemes) => void;
  onLanguage?: (language: string) => void;
  onNavigate?: (path: string) => void;
  onSidebar?: (canToggle: boolean) => void;
}

const SAFE_AREA_SIDES = ['top', 'right', 'bottom', 'left'] as const;

function isAppPath(path: unknown): path is string {
  return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//');
}

function applyHostSafeArea(insets: unknown): void {
  if (typeof insets !== 'string') return;
  const values = insets.split(',');
  if (values.length !== SAFE_AREA_SIDES.length || !values.every((value) => /^\d+(\.\d+)?px$/.test(value))) return;
  const root = document.documentElement.style;
  SAFE_AREA_SIDES.forEach((side, i) => root.setProperty(`--safe-area-inset-${side}`, values[i]));
}

export function initialCanToggleHostMenu(): boolean {
  if (!isHomeAssistant()) return false;
  return new URLSearchParams(window.location.search).get('cui_menu') === '1';
}

export function toggleHostMenu(open?: boolean): void {
  if (!isHomeAssistant() || window.parent === window) return;
  window.parent.postMessage(typeof open === 'boolean' ? { type: 'cui:menu', open } : { type: 'cui:menu' }, window.location.origin);
}

export function initHostSync(handlers: HostSyncHandlers): void {
  if (!isHomeAssistant()) return;

  applyHostSafeArea(new URLSearchParams(window.location.search).get('cui_safe'));

  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) return;
    if (event.source !== window.parent) return;

    const data = event.data as {
      type?: string;
      mode?: string;
      language?: string;
      path?: unknown;
      canToggle?: unknown;
      insets?: unknown;
    } | null;
    if (!data) return;

    if (data.type === 'cui:theme' && (data.mode === 'dark' || data.mode === 'light')) {
      handlers.onTheme?.(data.mode);
    } else if (data.type === 'cui:language' && typeof data.language === 'string' && data.language) {
      handlers.onLanguage?.(data.language);
    } else if (data.type === 'cui:navigate' && isAppPath(data.path)) {
      handlers.onNavigate?.(data.path);
    } else if (data.type === 'cui:sidebar' && typeof data.canToggle === 'boolean') {
      handlers.onSidebar?.(data.canToggle);
    } else if (data.type === 'cui:safe-area') {
      applyHostSafeArea(data.insets);
    }
  });
}
