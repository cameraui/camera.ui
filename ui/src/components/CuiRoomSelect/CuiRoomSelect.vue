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
      <Button v-tooltip.top="$t('components.form.button.create_room')" type="button" severity="secondary" text :disabled @click="openCreateRoomDialog">
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
import CreateRoomDialog from '@/components/CuiDialog/templates/CreateRoom/CreateRoom.vue';
import { buildRoomOptions } from './rooms.js';

import type { CuiRoomSelectProps } from './types.js';

const props = withDefaults(defineProps<CuiRoomSelectProps>(), { clearable: false, disabled: false, invalid: false });
const roomId = defineModel<string | null>({ required: true });

const roomsQuery = new RoomsQuery();

const dialog = useCuiDialog();
const { t } = useI18n();

const { data: catalog, isBusy: roomsLoading } = roomsQuery.getRoomsQuery();
const { mutateAsync: createRoom } = roomsQuery.createRoomMutation();
const { mutateAsync: deleteRoom, isPending: deletingRoom } = roomsQuery.deleteRoomMutation();

const grouped = computed(() => (catalog.value?.levels.length ?? 0) > 0);
const roomOptions = computed(() => buildRoomOptions(catalog.value, t));
const defaultRoom = computed(() => catalog.value?.rooms.find((room) => room.name === 'Default'));
const deletableRoom = computed(() => catalog.value?.rooms.find((room) => room.id === roomId.value && room.id !== defaultRoom.value?.id));

function openCreateRoomDialog() {
  dialog.openComponentDialog<Record<string, never>>(CreateRoomDialog, {
    data: {
      title: t('components.dialog.title.create_room'),
      confirmText: t('components.form.button.add'),
      contentProps: {},
    },
    onConfirm: async (name: string | null) => {
      if (!name) return;
      const room = await createRoom({ name, levelId: null, outdoor: false, publicSpace: false, note: '' });
      roomId.value = room.id;
    },
  });
}

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
