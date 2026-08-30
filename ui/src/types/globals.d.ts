import type { ElectronAPI } from './electron';

declare global {
  interface Window {
    electron?: ElectronAPI;
    __CUI_BASE__?: string;
    __CUI_EMBED__?: string;
    __CUI_HA_CARDS__?: boolean;
    __CUI_HA_CSS__?: string;
  }
}
