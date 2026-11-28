import { RoomsQuery } from '@/api/routes/rooms.js';
import CreateRoomDialog from '@/components/CuiDialog/templates/CreateRoom/CreateRoom.vue';

import type { DBRoom } from '@shared/types';

export function useCreateRoom() {
  const dialog = useCuiDialog();
  const { t } = useI18n();
  const { mutateAsync: createRoom } = new RoomsQuery().createRoomMutation();

  function openCreateRoom(onCreated: (room: DBRoom) => void) {
    dialog.openComponentDialog<Record<string, never>>(CreateRoomDialog, {
      data: {
        title: t('components.dialog.title.create_room'),
        confirmText: t('components.form.button.add'),
        contentProps: {},
      },
      onConfirm: async (name: string | null) => {
        if (name) onCreated(await createRoom({ name, levelId: null, outdoor: false, publicSpace: false, note: '' }));
      },
    });
  }

  return { openCreateRoom };
}
