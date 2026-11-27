import { NotificationsQuery } from '@/api/routes/notifications.js';
import { formatDayTime } from '@/common/utils.js';

export const MUTE_HOURS = [1, 8, 24];

export function useNotificationMute() {
  const notificationsQuery = new NotificationsQuery();
  const notificationsSocket = useNotificationsSocket();
  const toast = useCuiToast();
  const { t, locale } = useI18n();
  const now = useNow({ scheduler: (tick) => useIntervalFn(tick, 30_000) });

  const { data: settings, refetch } = notificationsQuery.getSettingsQuery();
  const { mutate: mute } = notificationsQuery.muteQuery();
  const { mutate: unmute } = notificationsQuery.unmuteQuery();

  const mutedUntil = computed(() => activeUntil(settings.value?.mutedUntil));

  watch(notificationsSocket.muteRevision, () => refetch());

  function activeUntil(until: number | null | undefined): number | undefined {
    if (until === null) return Infinity;
    return until && until > now.value.getTime() ? until : undefined;
  }

  function cameraMutedUntil(cameraId: string): number | undefined {
    return activeUntil(settings.value?.mutedCameras?.[cameraId]);
  }

  function muteLabel(key: 'muted_until' | 'camera_muted_until' | 'unmute_camera', until: number): string {
    if (!Number.isFinite(until)) return t(`components.notification_mute.${key}_no_end`);
    return t(`components.notification_mute.${key}`, { time: formatDayTime(until, locale.value) });
  }

  function muteFor(minutes?: number, cameraIds?: string[]): void {
    mute(
      { minutes, cameraIds },
      {
        onSuccess: (saved) => {
          const until = activeUntil(cameraIds ? saved.mutedCameras?.[cameraIds[0]] : saved.mutedUntil);
          if (!until) return;
          toast.add({ severity: 'success', detail: muteLabel(cameraIds ? 'camera_muted_until' : 'muted_until', until), life: 3000 });
        },
      },
    );
  }

  function unmuteNow(cameraIds?: string[]): void {
    unmute({ cameraIds });
  }

  return { mutedUntil, cameraMutedUntil, muteLabel, muteFor, unmute: unmuteNow };
}
