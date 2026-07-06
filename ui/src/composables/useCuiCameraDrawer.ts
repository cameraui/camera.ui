import type { CameraOptionsProps } from '@/components/CuiCameraDrawer/component/types.js';
import type { EventBusKey } from '@vueuse/core';
import type { DrawerProps } from 'primevue';

interface DrawerClose {
  type: 'close';
}

interface DrawerOpen {
  type: 'open';
  options: CameraOptionsProps;
  props?: DrawerProps;
}

type DrawerEvent = DrawerClose | DrawerOpen;

const bus: EventBusKey<DrawerEvent> = Symbol('cui-camera-drawer');
const drawerEventBus = useEventBus(bus);

export const DEFAULT_DRAWER_PROPS: DrawerProps = {
  position: 'right',
  showCloseIcon: false,
  modal: true,
  dismissable: true,
  baseZIndex: 1000,
  blockScroll: true,
  pt: {
    root: {
      class: 'w-full sm:w-[400px]',
    },
  },
};

export function useCuiCameraDrawer() {
  const visible = ref(false);

  const isOpen = computed(() => visible.value);

  const open = (options: CameraOptionsProps, props?: Partial<DrawerProps>) => {
    drawerEventBus.emit({
      type: 'open',
      options,
      props: {
        ...DEFAULT_DRAWER_PROPS,
        ...props,
      },
    });

    visible.value = true;
  };

  const close = () => {
    drawerEventBus.emit({
      type: 'close',
    });

    visible.value = false;
  };

  drawerEventBus.on((event) => {
    switch (event.type) {
      case 'close':
        visible.value = false;
        break;
      case 'open':
        visible.value = true;
        break;
    }
  });

  return {
    open,
    close,
    isOpen,
    getEventBus: () => drawerEventBus,
  };
}
