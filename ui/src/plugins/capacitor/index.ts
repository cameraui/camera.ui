import { registerAppLock } from './appLock.js';
import { registerDeepLinks } from './deepLinks.js';
import { registerKeyboard } from './keyboard.js';
import { registerSplashScreen } from './splashScreen.js';
import { registerUpdater } from './updater.js';

export function registerCapacitor() {
  registerAppLock();
  registerSplashScreen();
  registerUpdater();
  registerKeyboard();
  registerDeepLinks();
}
