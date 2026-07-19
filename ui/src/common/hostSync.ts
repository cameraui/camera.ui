import { isHomeAssistant } from '@/common/base.js';

import type { SupportedThemes } from '@shared/types';

interface HostSyncHandlers {
  onTheme?: (mode: SupportedThemes) => void;
  onLanguage?: (language: string) => void;
}

export function initHostSync(handlers: HostSyncHandlers): void {
  if (!isHomeAssistant()) return;

  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) return;
    const data = event.data as { type?: string; mode?: string; language?: string } | null;
    if (!data) return;

    if (data.type === 'cui:theme' && (data.mode === 'dark' || data.mode === 'light')) {
      handlers.onTheme?.(data.mode);
    } else if (data.type === 'cui:language' && typeof data.language === 'string' && data.language) {
      handlers.onLanguage?.(data.language);
    }
  });
}
