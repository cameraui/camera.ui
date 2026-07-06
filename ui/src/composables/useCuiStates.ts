import { BOTTOMBAR_SIZE } from '@/components/CuiBottombar/types.js';
import { TOPBAR_SIZE } from '@/components/CuiTopbar/types.js';

import type { NavbarState } from '@/components/CuiNavbar/types.js';
import type { SubNavbarState } from '@/components/CuiSubNavbar/types.js';

export function useCuiStates() {
  const uiStore = useUiStore();
  const route = useRoute();
  const routeMeta = useRouteMeta();
  const { state } = useCuiBus();
  const { mdBreakpoint, smBreakpoint, xlBreakpoint } = useSharedCuiBreakpoint();

  const { uiSettings } = storeToRefs(uiStore);

  const navbarState = computed<NavbarState | 'minified' | undefined>(() => {
    if (!showNavbar.value) return undefined;

    // navbarStayCollapsed: only 'opened' overrides, otherwise width-based
    if (uiSettings.value.interface.navbarStayCollapsed && state.navbarState !== 'opened') {
      return mdBreakpoint.value ? 'closed' : 'minified';
    }

    if (xlBreakpoint.value) return 'opened';

    if (state.navbarState === 'opened') return 'opened';

    // Default: derive from screen width (closed < 768px, minified >= 768px)
    return mdBreakpoint.value ? 'closed' : 'minified';
  });

  const subbarState = computed<SubNavbarState | undefined>(() => {
    return route.path.includes('/settings') ? (xlBreakpoint.value ? 'opened' : state.subbarState ? state.subbarState : 'closed') : undefined;
  });

  const showNavbar = computed(() => routeMeta.showNavbar.value);

  const showBottombar = computed(() => {
    return routeMeta.showBottombar.value && uiSettings.value.interface.showBottomBarOnMobile && smBreakpoint.value;
  });

  const showTopbar = computed(() => routeMeta.showTopbar.value);

  const topbarHeight = computed(() => (showTopbar.value ? (routeMeta.minifiedTopbar.value ? 0 : TOPBAR_SIZE.HEIGHT) : 0));

  const bottombarHeight = computed(() => (showBottombar.value ? BOTTOMBAR_SIZE.HEIGHT : 0));

  return {
    navbarState,
    subbarState,
    showBottombar,
    showNavbar,
    showTopbar,
    topbarHeight,
    bottombarHeight,
  };
}
