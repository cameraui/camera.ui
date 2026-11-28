<template>
  <InputGroup>
    <Select
      v-model="roomId"
      :options="roomOptions"
      option-label="label"
      option-value="value"
      :option-group-label="grouped ? 'label' : undefined"
      :option-group-children="grouped ? 'items' : undefined"
      :loading="roomsLoading"
      :placeholder
      :show-clear="clearable"
      :disabled
      :invalid
      class="min-w-0"
    />
    <InputGroupAddon>
      <Button
        v-tooltip.top="$t('components.form.button.create_room')"
        type="button"
        severity="secondary"
        text
        :disabled
        @click="openCreateRoom((room) => (roomId = room.id))"
      >
        <template #icon><i-mdi:plus /></template>
      </Button>
    </InputGroupAddon>
    <InputGroupAddon>
      <Button
        v-tooltip.top="$t('components.form.button.delete_room')"
        type="button"
        severity="danger"
        text
        :disabled="disabled || !deletableRoom"
        :loading="deletingRoom"
        @click="confirmDeleteRoom"
      >
        <template #icon><i-mdi:delete-outline /></template>
      </Button>
    </InputGroupAddon>
  </InputGroup>
</template>

<script setup lang="ts">
import { RoomsQuery } from '@/api/routes/rooms.js';
import { buildRoomOptions, NEW_ROOM } from './rooms.js';
import { useCreateRoom } from './useCreateRoom.js';

import type { RoomOption, RoomOptionGroup } from './rooms.js';
import type { CuiRoomSelectProps } from './types.js';

const roomsQuery = new RoomsQuery();

const props = withDefaults(defineProps<CuiRoomSelectProps>(), { clearable: false, disabled: false, invalid: false });
const roomId = defineModel<string | null>({ required: true });

const dialog = useCuiDialog();
const { t } = useI18n();
const { openCreateRoom } = useCreateRoom();

const { data: catalog, isBusy: roomsLoading } = roomsQuery.getRoomsQuery();
const { mutateAsync: deleteRoom, isPending: deletingRoom } = roomsQuery.deleteRoomMutation();

const grouped = computed(() => (catalog.value?.levels.length ?? 0) > 0);
const pendingRoom = computed(() => {
  const name = props.newRoom?.trim();
  if (!name || catalog.value?.rooms.some((room) => room.name.toLowerCase() === name.toLowerCase())) return undefined;
  return name;
});
const roomOptions = computed<RoomOption[] | RoomOptionGroup[]>(() => {
  const options = buildRoomOptions(catalog.value, t);
  const name = pendingRoom.value;
  if (!name) return options;
  if (!grouped.value) return [{ label: t('components.form.label.room_new', { name }), value: NEW_ROOM }, ...(options as RoomOption[])];
  return [{ label: t('components.form.label.room_new_group'), items: [{ label: name, value: NEW_ROOM }] }, ...(options as RoomOptionGroup[])];
});
const defaultRoom = computed(() => catalog.value?.rooms.find((room) => room.name === 'Default'));
const deletableRoom = computed(() => catalog.value?.rooms.find((room) => room.id === roomId.value && room.id !== defaultRoom.value?.id));

function confirmDeleteRoom() {
  const room = deletableRoom.value;
  if (!room) return;
  dialog.openTextDialog({
    data: {
      title: t('components.dialog.title.confirm'),
      confirmText: t('components.form.button.remove'),
      contentText: t('components.dialog.message.confirm_delete_room', { name: room.name }),
      confirmButtonProps: { severity: 'danger' },
    },
    onConfirm: async () => {
      await deleteRoom(room.id);
      if (roomId.value === room.id) roomId.value = props.clearable ? null : (defaultRoom.value?.id ?? null);
    },
  });
}
</script>
