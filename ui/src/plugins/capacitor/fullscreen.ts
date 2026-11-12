import { setNativeFullscreen } from '@camera.ui/browser';

export function registerFullscreen() {
  setNativeFullscreen({
    enter: async () => {
      const { SystemBars } = await import('@capacitor/core');
      await SystemBars.hide();
      return true;
    },
    exit: async () => {
      const { SystemBars } = await import('@capacitor/core');
      await SystemBars.show();
    },
  });
}
