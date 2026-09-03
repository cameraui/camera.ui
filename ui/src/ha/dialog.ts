import CameraEventDialog from '@/components/CuiDialog/templates/CameraStreamEvent/CameraStreamEvent.vue';

import type { CameraStreamEventProps } from '@/components/CuiDialog/templates/CameraStreamEvent/types.js';
import type { useCuiDialog } from '@/composables/useCuiDialog.js';
import type { DBCamera } from '@shared/types';

type CuiDialog = ReturnType<typeof useCuiDialog>;

export function openCameraDialog(dialog: CuiDialog, camera: DBCamera, eventTimestamp?: number): void {
  dialog.openComponentDialog<CameraStreamEventProps>(CameraEventDialog, {
    data: {
      title: camera.name,
      dedupeKey: `camera-event:${camera._id}:${eventTimestamp ?? 'live'}`,
      stayActive: true,
      hideCancelButton: true,
      hideConfirmButton: true,
      contentProps: { camera, eventTimestamp },
      draggable: true,
      blockDragOnSelectors: ['.p-dialog-body'],
      dismissableMask: false,
      modal: false,
      dialogContentClass: '!px-0 h-full',
      goTo: `/cameras/${camera.name}${eventTimestamp ? `?startTs=${eventTimestamp}` : ''}`,
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
