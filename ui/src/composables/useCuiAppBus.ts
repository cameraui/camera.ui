import type { NavbarState } from '@/components/CuiNavbar/types.js';
import type { SubNavbarState } from '@/components/CuiSubNavbar/types.js';
import type { EventBusKey } from '@vueuse/core';

export interface AppBus {
  navbarState?: NavbarState;
  subbarState?: SubNavbarState;
}

const bus: EventBusKey<AppBus> = Symbol('cui-app-bus');

const state = reactive<AppBus>({
  navbarState: undefined,
  subbarState: undefined,
});

export function resetCuiBus(): void {
  state.navbarState = undefined;
  state.subbarState = undefined;
}

export function useCuiBus() {
  const eventBus = useEventBus(bus);

  eventBus.on(({ subbarState, navbarState }) => {
    if (subbarState && subbarState !== state.subbarState) {
      state.subbarState = subbarState;
    }

    if (navbarState && navbarState !== state.navbarState) {
      state.navbarState = navbarState;
    }
  });

  return {
    state,
    bus: eventBus,
  };
}
