import { bulkPatchCamerasFn } from '@/api/routes/cameras.js';
import { extractErrorMessage, formatDayTime } from '@/common/utils.js';

import type { MaybeRefOrGetter } from 'vue';

interface PrivacyHolder {
  privacy?: { enabled: boolean; until?: number };
}

const MAX_DELAY_MS = 2 ** 31 - 1;

export function inPrivacy(camera: PrivacyHolder | undefined, now = Date.now()): boolean {
  const privacy = camera?.privacy;
  if (!privacy?.enabled) return false;
  return privacy.until === undefined || privacy.until > now;
}

export function usePrivacyActive(camera: MaybeRefOrGetter<PrivacyHolder | undefined>) {
  const now = ref(Date.now());

  watchEffect((onCleanup) => {
    const until = toValue(camera)?.privacy?.until;
    if (until === undefined || until <= now.value) return;
    const timer = setTimeout(() => (now.value = Date.now()), Math.min(until - now.value, MAX_DELAY_MS));
    onCleanup(() => clearTimeout(timer));
  });

  return computed(() => inPrivacy(toValue(camera), now.value));
}

export function usePrivacyLabel(camera: MaybeRefOrGetter<PrivacyHolder | undefined>) {
  const { t, locale } = useI18n();

  return computed(() => {
    const until = toValue(camera)?.privacy?.until;
    return until ? t('views.camera.camera_privacy_until', { time: formatDayTime(until, locale.value) }) : t('views.camera.camera_privacy');
  });
}

export function usePrivacySwitch() {
  const toast = useCuiToast();
  const queryClient = useQueryClient();

  const switching = ref(false);

  async function setPrivacy(cameraName: string, enabled: boolean) {
    if (switching.value) return;
    switching.value = true;
    try {
      const { failed } = await bulkPatchCamerasFn({ cameranames: [cameraName], cameraData: { privacy: { enabled } } });
      if (failed[0]) toast.add({ severity: 'error', detail: failed[0].error, life: 4000 });
    } catch (error) {
      toast.add({ severity: 'error', detail: extractErrorMessage(error), life: 4000 });
    } finally {
      await Promise.all([queryClient.refetchQueries({ queryKey: ['camerasList'] }), queryClient.refetchQueries({ queryKey: ['cameras', cameraName], exact: true })]);
      switching.value = false;
    }
  }

  return { switching, setPrivacy };
}
