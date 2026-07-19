import type { ElectronAPI } from './electron';

declare global {
  interface Window {
    electron?: ElectronAPI;
    __CUI_BASE__?: string;
    __CUI_EMBED__?: string;
  }
}
