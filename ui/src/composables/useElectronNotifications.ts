import type { IpcRendererEvent, NotificationClickPayload } from '@/types/electron';

export function useElectronNotifications() {
  const router = useRouter();
  const { isElectronApp, electron } = useElectron();

  function onNotificationClick(_event: IpcRendererEvent, data: NotificationClickPayload) {
    if (data?.deepLink) {
      router.push(data.deepLink);
    }
  }

  onMounted(() => {
    if (!isElectronApp || !electron) return;
    electron.removeListener('notification-click', onNotificationClick);
    electron.on('notification-click', onNotificationClick);
  });

  onUnmounted(() => {
    electron?.removeListener('notification-click', onNotificationClick);
  });
}
