import { registerAppLock } from './appLock.js';
import { registerDeepLinks } from './deepLinks.js';
import { registerDownloadCleanup } from './downloads.js';
import { registerFullscreen } from './fullscreen.js';
import { registerKeyboard } from './keyboard.js';
import { registerSplashScreen } from './splashScreen.js';
import { registerUpdater } from './updater.js';

export function registerCapacitor() {
  registerFullscreen();
  registerAppLock();
  registerSplashScreen();
  registerUpdater();
  registerKeyboard();
  registerDeepLinks();
  registerDownloadCleanup();
}
