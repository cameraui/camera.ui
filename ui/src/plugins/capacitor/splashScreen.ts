import { getConnection, isCapacitor } from '@/connection/index.js';

const SPLASH_HOLD_MS = 4_000;
const VIEW_FADE_MS = 300;

export function registerSplashScreen() {
  if (!isCapacitor) return;
  import('@capacitor/splash-screen').then(async ({ SplashScreen }) => {
    await until(getConnection().phase).toMatch((phase) => phase.kind !== 'idle' && phase.kind !== 'discovering', { timeout: SPLASH_HOLD_MS });
    setTimeout(() => SplashScreen.hide(), VIEW_FADE_MS);
  });
}
