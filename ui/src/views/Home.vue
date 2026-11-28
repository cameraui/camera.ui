<template>
  <div class="flex flex-col">
    <CuiTopbarSlot position="center">
      <div class="flex flex-row items-center justify-center gap-2">
        <InlineSvg :src="getImageUrl('logo_animated.svg')" width="18px" height="18px" title="camera.ui" aria-label="camera.ui" />
        <span class="font-semibold text-xl truncate">camera.ui</span>
      </div>
    </CuiTopbarSlot>

    <CuiHomeDashboard />
  </div>
</template>

<script setup lang="ts">
import { useEventStore } from '@camera.ui/nvr';
import InlineSvg from 'vue-inline-svg';

import { CamerasQuery } from '@/api/routes/cameras.js';
import { getImageUrl } from '@/common/utils.js';

import type { DBCamera } from '@shared/types';

const { openEpisodePlayer } = useEpisodePlayerDialog();
const { openCameraConsole } = useCameraConsoleDialog();
const eventStore = useEventStore();
const route = useRoute();
const router = useRouter();

const { data: cameras } = new CamerasQuery().getCamerasQuery({ page: 1, pageSize: -1 });

let consumedEpisodeLink: string | undefined;
let consumedConsoleLink: string | undefined;

watch(
  [() => route.query.episodeId, eventStore.isAvailable, cameras],
  async ([episodeId, nvrAvailable, cams]) => {
    if (typeof episodeId !== 'string' || !episodeId || !nvrAvailable || !cams?.result?.length) return;
    if (consumedEpisodeLink === episodeId) return;
    consumedEpisodeLink = episodeId;

    const episode = await eventStore.loadEpisode(episodeId);
    router.replace({ query: { ...route.query, episodeId: undefined } });
    if (!episode) return;

    const cameraById = new Map<string, DBCamera>(cams.result.map((cam) => [cam._id, cam]));
    openEpisodePlayer(episode, cameraById);
  },
  { immediate: true },
);

watch(
  [() => route.query.console, cameras],
  ([cameraId, cams]) => {
    if (typeof cameraId !== 'string' || !cameraId || !cams?.result?.length) return;
    if (consumedConsoleLink === cameraId) return;
    consumedConsoleLink = cameraId;

    router.replace({ query: { ...route.query, console: undefined } });
    const camera = cams.result.find((cam) => cam._id === cameraId);
    if (camera) openCameraConsole(camera);
  },
  { immediate: true },
);
</script>
