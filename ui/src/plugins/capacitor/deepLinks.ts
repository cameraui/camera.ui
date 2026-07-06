import { SHARE_SERVICE_URL } from '@/common/constants.js';
import { isCapacitor } from '@/connection/index.js';

export function registerDeepLinks(): void {
  if (!isCapacitor) return;

  let shareHost: string;
  try {
    shareHost = new URL(SHARE_SERVICE_URL).hostname;
  } catch {
    shareHost = 'share.cameraui.com';
  }

  import('@capacitor/app').then(({ App }) => {
    App.addListener('appUrlOpen', ({ url }) => {
      try {
        const parsed = new URL(url);
        if (parsed.hostname === shareHost) {
          const token = parsed.pathname.replace(/^\/+/, '').split('/')[0];
          if (token) {
            window.location.href = `${window.location.origin}/share/index.html#/${encodeURIComponent(token)}`;
          }
        }
      } catch {
        // ignore
      }
    });
  });
}
