import type { SettingsViews, UiSettingsLocalStorage } from '@shared/types';

export const settingsViews: SettingsViews[] = ['account', 'appearance', 'user', 'notifications', 'permissions', 'recordings', 'remote', 'backup', 'system'];

interface LoggerLocalStorage {
  'cui-logger-debug': number;
  'cui-logger-recording': number;
}

const defaultUiSettings: UiSettingsLocalStorage & LoggerLocalStorage = {
  cameras: {
    showEvents: true,
    order: [],
    groupOrder: {},
    viewMode: 'default',
    dragDisabled: true,
  },
  camview: {
    dragDisabled: false,
  },
  config: {
    zoom: 12,
  },
  console: {
    zoom: 12,
  },
  interface: {
    showBottomBarOnMobile: true,
    selectedSettingsView: 'account',
    navbarStayCollapsed: true,
    landingPage: '/home',
    tableRows: 15,
  },
  sensors: {
    hideCameraBound: true,
  },
  plugins: {
    view: 'cards',
  },
  'cui-logger-debug': 1,
  'cui-logger-recording': 1,
};

export const useUiStore = defineStore('ui', () => {
  const uiSettings = useLocalStorage<UiSettingsLocalStorage>('ui', defaultUiSettings, {
    mergeDefaults: true,
  });

  uiSettings.value.interface.landingPage ??= '/home';
  uiSettings.value.interface.tableRows ??= 15;

  return {
    uiSettings,
  };
});
