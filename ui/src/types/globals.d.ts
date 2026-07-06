import type { ElectronAPI } from './electron';

declare global {
  interface Window {
    electron?: ElectronAPI;
  }
}
