import EpisodeTraceDialog from '@/components/CuiDialog/templates/EpisodeTrace/EpisodeTrace.vue';

import type { EpisodeTraceProps } from '@/components/CuiDialog/templates/EpisodeTrace/types.js';
import type { RecordedEpisode } from '@camera.ui/nvr';
import type { DBCamera } from '@shared/types';
import type { DynamicDialogInstance } from 'primevue/dynamicdialogoptions';

export function useEpisodeTraceDialog() {
  const dialog = useCuiDialog();
  const { t } = useI18n();

  function openEpisodeTrace(episode: RecordedEpisode, cameraById: Map<string, DBCamera>): DynamicDialogInstance {
    const first = episode.members[0];
    const camera = first ? cameraById.get(first.cameraId) : undefined;

    return dialog.openComponentDialog<EpisodeTraceProps>(EpisodeTraceDialog, {
      data: {
        title: episode.description?.title ?? t('views.recordings.episode_trace.title'),
        dedupeKey: `episode-trace:${episode.id}`,
        stayActive: true,
        hideCancelButton: true,
        hideConfirmButton: true,
        contentProps: {
          episode,
          cameraById,
        },
        headerActions: [],
        draggable: true,
        blockDragOnSelectors: ['.p-dialog-body'],
        dismissableMask: false,
        modal: false,
        dialogContentClass: '!px-0 h-full',
        goTo: camera ? `/cameras/${camera.name}?startTs=${episode.startTime}` : undefined,
      },
      dialogSize: {
        desktop: {
          maxWidth: '1000px',
          maxHeight: 'calc(100vh - max(1rem, var(--safe-area-inset-top)) - max(1rem, var(--safe-area-inset-bottom)))',
          width: '70vw',
        },
      },
    });
  }

  return { openEpisodeTrace };
}
