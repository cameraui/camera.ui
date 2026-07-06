import { isCapacitor } from '@/connection/index.js';

export function registerSplashScreen() {
  if (!isCapacitor) return;
  import('@capacitor/splash-screen').then(({ SplashScreen }) => {
    const hide = () => SplashScreen.hide();
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(hide, { timeout: 3000 });
    } else {
      requestAnimationFrame(() => requestAnimationFrame(hide));
    }
  });
}
