export const TABLE_PAGINATOR_TEMPLATE = 'FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink';
export const TABLE_PAGE_LINK_SIZE = 3;

export const AUTH_SERVICE_URL = import.meta.env.VITE_AUTH_SERVICE_URL ?? 'https://auth.cameraui.com';
export const BILLING_SERVICE_URL = import.meta.env.VITE_BILLING_SERVICE_URL ?? 'https://billing.cameraui.com';
export const CLOUD_SERVICE_URL = import.meta.env.VITE_CLOUD_SERVICE_URL ?? 'https://cloud.cameraui.com';
export const PROXY_SERVICE_URL = import.meta.env.VITE_PROXY_SERVICE_URL ?? 'https://proxy.cameraui.com';
export const PROXY_TUNNEL_ENDPOINT = import.meta.env.VITE_PROXY_TUNNEL_ENDPOINT ?? 'https://tunnel.cameraui.com:9092';
export const SHARE_SERVICE_URL = import.meta.env.VITE_SHARE_SERVICE_URL ?? 'https://share.cameraui.com';

export const PROXY_SERVICE_HOST = (() => {
  try {
    return new URL(PROXY_SERVICE_URL).host;
  } catch {
    return '';
  }
})();

export const FACE_CLARITY_UNCLEAR = 0.7;
export const FACE_CLARITY_CLEAR = 0.8;
