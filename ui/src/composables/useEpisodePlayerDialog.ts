import EpisodePlayerDialog from '@/components/CuiDialog/templates/EpisodePlayer/EpisodePlayer.vue';

import type { EpisodePlayerProps } from '@/components/CuiDialog/templates/EpisodePlayer/types.js';
import type { RecordedEpisode } from '@camera.ui/nvr';
import type { DBCamera } from '@shared/types';
import type { DynamicDialogInstance } from 'primevue/dynamicdialogoptions';

export function useEpisodePlayerDialog() {
  const dialog = useCuiDialog();

  function openEpisodePlayer(episode: RecordedEpisode, cameraById: Map<string, DBCamera>): DynamicDialogInstance | undefined {
    const first = episode.members[0];
    const camera = first ? cameraById.get(first.cameraId) : undefined;
    if (!camera) return undefined;

    return dialog.openComponentDialog<EpisodePlayerProps>(EpisodePlayerDialog, {
      data: {
        title: episode.description?.title ?? camera.name,
        dedupeKey: `episode:${episode.id}`,
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
        goTo: `/cameras/${camera.name}?startTs=${episode.startTime}`,
      },
      dialogSize: {
        desktop: {
          maxWidth: '900px',
          maxHeight: 'calc(100vh - max(1rem, var(--safe-area-inset-top)) - max(1rem, var(--safe-area-inset-bottom)))',
          width: '60vw',
        },
      },
    });
  }

  return { openEpisodePlayer };
}
