const { isElectronApp } = useElectron();

export const WINDOW_CONTROL_HEIGHT = isElectronApp ? 25 : 0;
