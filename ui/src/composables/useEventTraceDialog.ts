import EventTraceDialog from '@/components/CuiDialog/templates/EventTrace/EventTrace.vue';

import type { EventTraceProps } from '@/components/CuiDialog/templates/EventTrace/types.js';
import type { RecordedEvent } from '@camera.ui/nvr';
import type { DBCamera } from '@shared/types';
import type { DynamicDialogInstance } from 'primevue/dynamicdialogoptions';

export function useEventTraceDialog() {
  const dialog = useCuiDialog();

  function openEventTrace(event: RecordedEvent, camera: DBCamera): DynamicDialogInstance {
    return dialog.openComponentDialog<EventTraceProps>(EventTraceDialog, {
      data: {
        title: camera.name,
        dedupeKey: `event-trace:${event.id}`,
        stayActive: true,
        hideCancelButton: true,
        hideConfirmButton: true,
        contentProps: {
          event,
          camera,
        },
        headerActions: [],
        draggable: true,
        blockDragOnSelectors: ['.p-dialog-body'],
        dismissableMask: false,
        modal: false,
        dialogContentClass: '!px-0 h-full',
        goTo: `/cameras/${camera.name}?startTs=${event.startTime}`,
      },
      dialogSize: {
        desktop: {
          maxWidth: '1100px',
          maxHeight: 'calc(100vh - max(1rem, var(--safe-area-inset-top)) - max(1rem, var(--safe-area-inset-bottom)))',
          width: '70vw',
        },
      },
    });
  }

  return { openEventTrace };
}
