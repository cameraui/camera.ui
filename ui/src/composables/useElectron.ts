const electron = typeof window !== 'undefined' ? window.electron : undefined;
const isElectronApp = electron !== undefined;

export function useElectron() {
  return { isElectronApp, electron };
}
