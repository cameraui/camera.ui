<template>
  <div class="relative h-full w-full overflow-hidden bg-black" :class="{ 'cursor-pointer': clickable }" @click="emit('open')">
    <CuiCameraSnapshot ref="snapshotRef" :camera="camera" show-timestamp width="100%" :height="fill ? '100%' : 'auto'" :object-fit="fit" />

    <div class="pointer-events-none absolute bottom-0 z-3 flex h-[60px] w-full items-center justify-between gap-1 p-4">
      <span class="flex min-w-0 items-center gap-1 rounded-full bg-black/60 p-2 text-xs font-semibold text-white">
        <span class="truncate">{{ typeof camera === 'string' ? camera : camera.name }}</span>
      </span>
      <Button
        v-tooltip.top="{ value: $t('components.player.refresh_snapshot') }"
        severity="secondary"
        rounded
        class="dark-mode cui-icon-md pointer-events-auto ml-auto"
        @click.stop="snapshotRef?.refresh()"
      >
        <template #icon>
          <i-material-symbols:refresh-rounded width="100%" height="100%" />
        </template>
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import CuiCameraSnapshot from '@/components/CuiCameraSnapshot/CuiCameraSnapshot.vue';

import type { DBCamera } from '@shared/types';

defineProps<{
  camera: DBCamera | string;
  fill: boolean;
  fit: 'contain' | 'cover';
  clickable: boolean;
}>();

const emit = defineEmits<{ (e: 'open'): void }>();

const snapshotRef = useTemplateRef<InstanceType<typeof CuiCameraSnapshot>>('snapshotRef');
</script>
