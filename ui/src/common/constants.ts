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
