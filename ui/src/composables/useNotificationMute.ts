import { NotificationsQuery } from '@/api/routes/notifications.js';

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

  function activeUntil(until: number | undefined): number | undefined {
    return until && until > now.value.getTime() ? until : undefined;
  }

  function cameraMutedUntil(cameraId: string): number | undefined {
    return activeUntil(settings.value?.mutedCameras?.[cameraId]);
  }

  function formatMuteEnd(until: number): string {
    const sameDay = new Date(until).toDateString() === new Date().toDateString();
    return new Intl.DateTimeFormat(locale.value, { weekday: sameDay ? undefined : 'short', hour: '2-digit', minute: '2-digit' }).format(until);
  }

  function muteFor(hours: number, cameraId?: string): void {
    mute(
      { minutes: hours * 60, cameraId },
      {
        onSuccess: (saved) => {
          const until = cameraId ? saved.mutedCameras?.[cameraId] : saved.mutedUntil;
          if (!until) return;
          const detail = t(cameraId ? 'components.notification_mute.camera_muted_until' : 'components.notification_mute.muted_until', { time: formatMuteEnd(until) });
          toast.add({ severity: 'success', detail, life: 3000 });
        },
      },
    );
  }

  function unmuteNow(cameraId?: string): void {
    unmute({ cameraId });
  }

  return { mutedUntil, cameraMutedUntil, formatMuteEnd, muteFor, unmute: unmuteNow };
}
