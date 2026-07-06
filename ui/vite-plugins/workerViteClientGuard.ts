import type { Plugin } from 'vite';

// In dev, Vite injects `/@vite/client` into every served module — including
// workers. The client opens a WebSocket to the dev server and applies CSS
// HMR pushes via `document.createElement(...)`, which crashes the worker
// (no DOM). `worker.plugins` only runs at production bundle time, so we
// patch `/@vite/client` itself.
//
// The prologue:
//  1. Installs a no-op `document` stub if missing — silences CSS HMR pushes.
//  2. Wraps `WebSocket` to stub connections that target the dev server's
//     HMR endpoint (port + root path). NATS WS (`/api/proxy/...`) and any
//     other URL goes through untouched.
//
// In main thread `document` exists and the guard is a no-op end-to-end.
function buildPrologue(uiPort: number): string {
  return `if (typeof document === 'undefined') {
  const __cui_noop = () => {};
  const __cui_fakeEl = { setAttribute: __cui_noop, textContent: '', insertAdjacentElement: __cui_noop };
  globalThis.document = {
    createElement: () => __cui_fakeEl,
    head: { appendChild: __cui_noop },
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  const __cui_realWS = globalThis.WebSocket;
  const __cui_devPort = ${JSON.stringify(String(uiPort))};
  const __cui_isViteHmrUrl = (raw) => {
    try {
      const u = new URL(typeof raw === 'string' ? raw : raw.href);
      return u.port === __cui_devPort && (u.pathname === '/' || u.pathname === '');
    } catch { return false; }
  };
  globalThis.WebSocket = function (url, protocols) {
    if (__cui_isViteHmrUrl(url)) {
      return {
        readyState: 3, url: String(url), protocol: '', bufferedAmount: 0, extensions: '', binaryType: 'blob',
        CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3,
        onopen: null, onmessage: null, onerror: null, onclose: null,
        send: __cui_noop, close: __cui_noop,
        addEventListener: __cui_noop, removeEventListener: __cui_noop, dispatchEvent: () => false,
      };
    }
    return new __cui_realWS(url, protocols);
  };
  globalThis.WebSocket.prototype = __cui_realWS.prototype;
  globalThis.WebSocket.CONNECTING = 0;
  globalThis.WebSocket.OPEN = 1;
  globalThis.WebSocket.CLOSING = 2;
  globalThis.WebSocket.CLOSED = 3;
}
`;
}

export function workerViteClientGuard(uiPort: number): Plugin {
  const prologue = buildPrologue(uiPort);
  return {
    name: 'camera-ui:worker-vite-client-guard',
    apply: 'serve',
    enforce: 'post',
    transform(code, id) {
      const isViteClient = id.includes('/@vite/client') || id.includes('vite/dist/client/client') || (id.endsWith('/client.mjs') && code.includes('updateStyle'));
      if (!isViteClient) return null;
      if (code.startsWith(prologue)) return null;
      return prologue + code;
    },
  };
}
