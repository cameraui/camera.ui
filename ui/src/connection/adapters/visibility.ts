import { isCapacitor } from '../runtime.js';

import type { VisibilitySource } from '@camera.ui/transport';

export function createVisibilitySource(): VisibilitySource {
  if (isCapacitor) {
    return createCapacitorVisibilitySource();
  }
  return globalThis.document as unknown as VisibilitySource;
}

function createCapacitorVisibilitySource(): VisibilitySource {
  const target = new EventTarget() as VisibilitySource;
  (target as { visibilityState: DocumentVisibilityState }).visibilityState = 'visible';

  void (async () => {
    const { App } = await import('@capacitor/app');
    App.addListener('appStateChange', ({ isActive }) => {
      (target as { visibilityState: DocumentVisibilityState }).visibilityState = isActive ? 'visible' : 'hidden';
      target.dispatchEvent(new Event('visibilitychange'));
    });
  })();

  return target;
}
