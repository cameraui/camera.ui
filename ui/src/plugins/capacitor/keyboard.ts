import { isCapacitor } from '@/connection/index.js';

export function registerKeyboard() {
  if (!isCapacitor) return;
  Promise.all([import('@capacitor/keyboard'), import('@capacitor/core')]).then(([{ Keyboard }, { Capacitor }]) => {
    if (Capacitor.getPlatform() === 'ios') {
      Keyboard.setAccessoryBarVisible({ isVisible: false });
    }
  });
}
