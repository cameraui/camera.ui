import EventTraceDialog from '@/components/CuiDialog/templates/EventTrace/EventTrace.vue';

import type { EventTraceProps } from '@/components/CuiDialog/templates/EventTrace/types.js';
import type { RecordedEvent } from '@camera.ui/nvr';
import type { DBCamera } from '@shared/types';
import type { DynamicDialogInstance } from 'openvue/dynamicdialogoptions';
import type { Ref } from 'vue';

export function useEventTraceDialog() {
  const dialog = useCuiDialog();

  function openEventTrace(event: RecordedEvent, camera: DBCamera, startAtMs?: number): DynamicDialogInstance {
    const openedAt = Date.now();
    const instance = dialog.openComponentDialog<EventTraceProps>(EventTraceDialog, {
      data: {
        title: camera.name,
        dedupeKey: `event-trace:${event.id}`,
        stayActive: true,
        hideCancelButton: true,
        hideConfirmButton: true,
        contentProps: {
          event,
          camera,
          startAtMs,
          openedAt,
        },
        headerActions: [],
        draggable: true,
        blockDragOnSelectors: ['.p-dialog-body'],
        dismissableMask: false,
        modal: false,
        dialogContentClass: '!px-0 h-full',
        goTo: `/cameras/${encodeURIComponent(camera.name)}?startTs=${event.startTime}`,
      },
      dialogSize: {
        desktop: {
          maxWidth: '1100px',
          maxHeight: 'calc(100vh - max(1rem, var(--safe-area-inset-top)) - max(1rem, var(--safe-area-inset-bottom)))',
          width: '70vw',
        },
      },
    });

    const contentProps = (instance.data as { contentProps?: Ref<EventTraceProps | undefined> } | undefined)?.contentProps?.value;
    if (contentProps && contentProps.openedAt !== openedAt) {
      contentProps.startAtMs = startAtMs;
      contentProps.openedAt = openedAt;
    }

    return instance;
  }

  return { openEventTrace };
}
