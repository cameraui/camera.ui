import { runtimeBase } from '@/common/base.js';

import type { EventPopupPayload } from '@/types/electron';

export function useEventPopup() {
  const { electron } = useElectron();

  function showEventPopup(payload: Omit<EventPopupPayload, 'url'>): void {
    try {
      electron?.send('show-event-popup', { ...payload, url: new URL('event-popup', `${window.location.origin}${runtimeBase()}`).href });
    } catch {
      // desktop apps before the event popup refuse the channel
    }
  }

  return { showEventPopup };
}
