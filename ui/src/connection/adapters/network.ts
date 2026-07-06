import { isCapacitor } from '../runtime.js';

export interface NetworkAdapters {
  readonly networkSource: EventTarget;
  readonly networkChangeSource?: EventTarget;
}

export function createNetworkAdapters(): NetworkAdapters {
  if (isCapacitor) {
    return createCapacitorNetworkAdapters();
  }
  return { networkSource: window };
}

function createCapacitorNetworkAdapters(): NetworkAdapters {
  const networkSource = new EventTarget();
  const networkChangeSource = new EventTarget();

  let lastConnected: boolean | null = null;
  let lastType: string | null = null;

  void (async () => {
    const { Network } = await import('@capacitor/network');

    const status = await Network.getStatus();
    lastConnected = status.connected;
    lastType = status.connectionType;

    Network.addListener('networkStatusChange', (next) => {
      if (lastConnected !== next.connected) {
        lastConnected = next.connected;
        networkSource.dispatchEvent(new Event(next.connected ? 'online' : 'offline'));
      }
      // Type change while still connected (WiFi ↔ Cellular) — separate signal so
      // attachNetworkChange can dispatch USER_RETRY to escape an existing backoff.
      if (next.connected && lastType !== next.connectionType) {
        lastType = next.connectionType;
        networkChangeSource.dispatchEvent(new Event('change'));
      }
    });
  })();

  return { networkSource, networkChangeSource };
}
