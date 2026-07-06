import { bindStorage, flushNow, installConsoleCapture } from '@camera.ui/logger';

bindStorage(localStorage);
installConsoleCapture();

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushNow);
}
