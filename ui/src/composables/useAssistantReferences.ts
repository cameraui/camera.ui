import { useEventStore } from '@camera.ui/nvr';

import { getCamerasFn } from '@/api/routes/cameras.js';
import CameraEventDialog from '@/components/CuiDialog/templates/CameraStreamEvent/CameraStreamEvent.vue';

import type { AssistantReference } from '@/components/CuiAssistantReferences/types.js';
import type { CameraStreamEventProps } from '@/components/CuiDialog/templates/CameraStreamEvent/types.js';
import type { DBCamera } from '@shared/types';

export function useAssistantReferences() {
  const router = useRouter();
  const { t } = useI18n();
  const toast = useCuiToast();
  const dialog = useCuiDialog();
  const { openEpisodePlayer } = useEpisodePlayerDialog();
  const eventStore = useEventStore('@camera.ui/camera-ui-nvr');
  const { download } = useFileDownload();

  const busy = ref<string | null>(null);

  async function loadCameras(): Promise<Map<string, DBCamera>> {
    const response = await getCamerasFn({ parameter: { page: 1, pageSize: -1 }, signal: new AbortController().signal });
    return new Map(response.result.map((camera) => [camera._id, camera]));
  }

  function openRecording(camera: DBCamera, timestamp: number): void {
    dialog.openComponentDialog<CameraStreamEventProps>(CameraEventDialog, {
      data: {
        title: camera.name,
        dedupeKey: `camera-event:${camera._id}:${timestamp}`,
        stayActive: true,
        hideCancelButton: true,
        hideConfirmButton: true,
        contentProps: { camera, eventTimestamp: timestamp },
        draggable: true,
        blockDragOnSelectors: ['.p-dialog-body'],
        dismissableMask: false,
        modal: false,
        dialogContentClass: '!px-0 h-full',
        goTo: `/cameras/${camera.name}?startTs=${timestamp}`,
      },
      dialogSize: {
        desktop: {
          maxWidth: '800px',
          maxHeight: 'calc(100vh - max(1rem, var(--safe-area-inset-top)) - max(1rem, var(--safe-area-inset-bottom)))',
          width: '50vw',
        },
      },
    });
  }

  async function open(reference: AssistantReference): Promise<void> {
    busy.value = reference.id;
    try {
      if (reference.kind === 'download') {
        if (!reference.url) throw new Error('missing');
        await download({ url: reference.url, filename: reference.label || 'clip.mp4', mimeType: 'video/mp4' });
        return;
      }
      const cameras = await loadCameras();

      if (reference.kind === 'camera') {
        const camera = cameras.get(reference.id);
        if (!camera) throw new Error('missing');
        await router.push(`/cameras/${camera.name}`);
        return;
      }

      if (reference.kind === 'episode') {
        let episode = eventStore.getEpisode(reference.id);
        if (!episode) {
          await eventStore.loadEpisodes({ limit: 50 });
          episode = eventStore.getEpisode(reference.id);
        }
        if (!episode || !openEpisodePlayer(episode, cameras)) throw new Error('missing');
        return;
      }

      const camera = reference.cameraId ? cameras.get(reference.cameraId) : undefined;
      if (!camera || !reference.timestamp) throw new Error('missing');
      openRecording(camera, reference.timestamp);
    } catch {
      toast.add({ severity: 'warn', detail: t('views.assistant.reference_missing'), life: 4000 });
    } finally {
      busy.value = null;
    }
  }

  return { busy, open };
}
