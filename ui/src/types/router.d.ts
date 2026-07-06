import type { _RouterClassic } from 'vue-router';

interface RouteMetaAuth {
  requiresAuth: boolean;
  role: 'master' | 'admin' | 'user' | 'none';
}

interface RouteMetaUi {
  background?: ComputedRef<string | undefined> | string;

  showNavbar?: ComputedRef<boolean> | boolean;
  showTopbar?: ComputedRef<boolean> | boolean;
  showBottombar?: ComputedRef<boolean> | boolean;
  showRouterLoading?: ComputedRef<boolean> | boolean;
  showRouterLoadingSub?: ComputedRef<boolean> | boolean;
  minifiedTopbar?: ComputedRef<boolean> | boolean;

  containerSettings?: {
    showTitle?: ComputedRef<boolean> | boolean;
    padding?: ComputedRef<boolean> | boolean;
    paddingTop?: ComputedRef<boolean> | boolean;
    paddingBottom?: ComputedRef<boolean> | boolean;
    paddingLeft?: ComputedRef<boolean> | boolean;
    paddingRight?: ComputedRef<boolean> | boolean;
    fullwidth?: ComputedRef<boolean> | boolean;
    disableScroll?: ComputedRef<boolean> | boolean;
    ignoreSafeAreaBottom?: ComputedRef<boolean> | boolean;
    noExtraPadding?: ComputedRef<boolean> | boolean;
    allowOverflowX?: ComputedRef<boolean> | boolean;
  };
}

interface RouteMetaNavigation {
  icon: {
    default: string;
    active: string;
  };
}

interface RouteMetaNavbar extends RouteMetaNavigation {
  position: 'top' | 'bottom';
  group?: 'more';
}

interface RouteMetaBottombar extends RouteMetaNavigation {}

interface RouteMetaSettingsBar extends RouteMetaNavigation {}

interface RouteMetaProfileMenu extends RouteMetaNavigation {}

declare module 'vue-router' {
  interface Router extends _RouterClassic {
    absUrl: (url?: string, newTab?: boolean) => void;
  }

  interface TypesConfig {
    Router: Router;
  }

  interface RouteMeta {
    name: string;
    path?: string;
    description?: string;
    auth?: RouteMetaAuth;
    ui?: RouteMetaUi;
    navbar?: RouteMetaNavbar;
    bottombar?: RouteMetaBottombar;
    settingsBar?: RouteMetaSettingsBar;
    menu?: RouteMetaProfileMenu;
    disabledInElectron?: boolean;
  }
}
