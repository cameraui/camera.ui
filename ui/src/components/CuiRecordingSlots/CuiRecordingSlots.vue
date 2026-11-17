<template>
  <div v-if="hasChoice">
    <span class="card-title">{{ $t('views.settings.recordings.slots_title') }}</span>
    <Card class="cui-card">
      <template #content>
        <div class="flex flex-col gap-4">
          <span class="text-sm">{{ $t('views.settings.recordings.slots_info') }}</span>

          <div class="flex flex-col divide-y divide-(--border-color)">
            <div v-for="(cameraId, index) in order" :key="cameraId" class="flex items-center gap-3 py-2 text-sm">
              <span class="min-w-0 flex-1 truncate font-medium text-color">{{ cameraNames.get(cameraId) ?? cameraId }}</span>
              <Tag
                :severity="index < slotCount ? 'success' : 'warn'"
                :value="index < slotCount ? $t('views.settings.recordings.slot_used') : $t('views.settings.recordings.slot_waiting')"
                class="text-[10px] shrink-0"
              />
              <div class="flex shrink-0">
                <Button
                  v-tooltip.top="{ value: $t('views.settings.recordings.slot_move_up') }"
                  type="button"
                  severity="secondary"
                  text
                  rounded
                  class="cui-icon-md"
                  :disabled="index === 0 || saving"
                  @click="move(index, -1)"
                >
                  <template #icon>
                    <i-mdi:chevron-up width="100%" height="100%" />
                  </template>
                </Button>
                <Button
                  v-tooltip.top="{ value: $t('views.settings.recordings.slot_move_down') }"
                  type="button"
                  severity="secondary"
                  text
                  rounded
                  class="cui-icon-md"
                  :disabled="index === order.length - 1 || saving"
                  @click="move(index, 1)"
                >
                  <template #icon>
                    <i-mdi:chevron-down width="100%" height="100%" />
                  </template>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </template>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { useRecordingSlots } from '@camera.ui/nvr';

import { CamerasQuery } from '@/api/routes/cameras.js';

const camerasQuery = new CamerasQuery();

const toast = useCuiToast();
const { slots, setOrder } = useRecordingSlots();

const { data: camerasData } = camerasQuery.getCamerasQuery({ page: 1, pageSize: -1 });

const saving = ref(false);

const order = computed(() => slots.value?.cameraIds ?? []);
const slotCount = computed(() => slots.value?.slots ?? 0);
const hasChoice = computed(() => slotCount.value > 0 && order.value.length > slotCount.value);
const cameraNames = computed(() => new Map((camerasData.value?.result ?? []).map((camera) => [camera._id, camera.name])));

async function move(index: number, step: number) {
  const next = [...order.value];
  [next[index], next[index + step]] = [next[index + step], next[index]];
  saving.value = true;
  try {
    await setOrder(next);
  } catch (error) {
    toast.add({ severity: 'error', detail: error, life: 3000 });
  } finally {
    saving.value = false;
  }
}
</script>
