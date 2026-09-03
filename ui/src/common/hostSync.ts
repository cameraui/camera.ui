import { isHaIngress, isHomeAssistant } from '@/common/base.js';

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

function isHostMessage(event: MessageEvent): boolean {
  return event.origin === window.location.origin && event.source === window.parent;
}

function postToHost(message: Record<string, unknown>): void {
  if (window.parent === window) return;
  window.parent.postMessage(message, window.location.origin);
}

function setSafeArea(values: string[]): void {
  if (values.length !== SAFE_AREA_SIDES.length || !values.every((value) => /^\d+(\.\d+)?px$/.test(value))) return;
  const root = document.documentElement.style;
  SAFE_AREA_SIDES.forEach((side, i) => root.setProperty(`--safe-area-inset-${side}`, values[i]));
}

function applyPanelSafeArea(insets: unknown): void {
  if (typeof insets === 'string') setSafeArea(insets.split(','));
}

function applyIngressSafeArea(insets: unknown): void {
  if (!insets || typeof insets !== 'object') return;
  const record = insets as Record<string, unknown>;
  setSafeArea(SAFE_AREA_SIDES.map((side) => (typeof record[side] === 'string' && record[side] ? record[side] : '0px')));
}

export function initialCanToggleHostMenu(): boolean {
  if (!isHomeAssistant()) return false;
  return new URLSearchParams(window.location.search).get('cui_menu') === '1';
}

export function toggleHostMenu(open?: boolean): void {
  if (isHaIngress()) {
    postToHost({ type: 'home-assistant/toggle-menu' });
  } else if (isHomeAssistant()) {
    postToHost(typeof open === 'boolean' ? { type: 'cui:menu', open } : { type: 'cui:menu' });
  }
}

export function initHostSync(handlers: HostSyncHandlers): void {
  if (isHaIngress()) {
    initIngressSync(handlers);
  } else if (isHomeAssistant()) {
    initPanelSync(handlers);
  }
}

function initPanelSync(handlers: HostSyncHandlers): void {
  applyPanelSafeArea(new URLSearchParams(window.location.search).get('cui_safe'));

  window.addEventListener('message', (event) => {
    if (!isHostMessage(event)) return;

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
      applyPanelSafeArea(data.insets);
    }
  });
}

function initIngressSync(handlers: HostSyncHandlers): void {
  let narrow: boolean | null = null;

  const subscribe = (kioskMode: boolean): void => postToHost({ type: 'home-assistant/subscribe-properties', handleSafeArea: true, kioskMode });

  window.addEventListener('message', (event) => {
    if (!isHostMessage(event)) return;

    const data = event.data as { type?: string; narrow?: unknown; safeAreaInsets?: unknown } | null;
    if (!data || data.type !== 'home-assistant/properties') return;

    applyIngressSafeArea(data.safeAreaInsets);
    if (typeof data.narrow !== 'boolean' || data.narrow === narrow) return;

    const wasNarrow = narrow;
    narrow = data.narrow;
    handlers.onSidebar?.(narrow);
    if (narrow) {
      subscribe(true);
    } else if (wasNarrow) {
      postToHost({ type: 'home-assistant/unsubscribe-properties' });
      subscribe(false);
    }
  });

  subscribe(false);
}
