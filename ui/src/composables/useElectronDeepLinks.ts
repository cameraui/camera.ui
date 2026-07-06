import type { DeepLinkPayload, IpcRendererEvent } from '@/types/electron';

export function useElectronDeepLinks() {
  const router = useRouter();
  const { isElectronApp, electron } = useElectron();

  function onDeepLink(_event: IpcRendererEvent, data: DeepLinkPayload) {
    if (data?.path) {
      router.push(data.path);
    }
  }

  onMounted(() => {
    if (!isElectronApp || !electron) return;
    electron.removeListener('deep-link', onDeepLink);
    electron.on('deep-link', onDeepLink);
  });

  onUnmounted(() => {
    electron?.removeListener('deep-link', onDeepLink);
  });
}
