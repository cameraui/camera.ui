<template>
  <div
    v-element-hover="(hovered) => (isHovered = hovered)"
    class="fixed flex flex-row items-center z-[99999] top-0 left-[7px] gap-2 p-2 pl-[0.4rem]! non-draggable-region"
  >
    <div class="close-button" @click="close">
      <i-mdi:close
        color="#7f050a"
        width="100%"
        height="100%"
        class="transition-opacity opacity-0"
        :class="{
          'opacity-100': isHovered,
        }"
      />
    </div>
    <div
      :class="{
        'disabled-button': isFullscreen,
        'minify-button': !isFullscreen,
      }"
      @click="minify"
    >
      <i-mdi:minus
        v-if="!isFullscreen"
        color="#995712"
        width="100%"
        height="100%"
        class="transition-opacity opacity-0"
        :class="{
          'opacity-100': isHovered,
        }"
      />
    </div>
    <div class="expand-button" :style="`${isFullscreen ? 'transform: rotate(45deg)' : 'transform: rotate(-45deg)'}`" @click="expand">
      <i-mdi:unfold-more-horizontal
        v-if="!isFullscreen"
        color="#0d650d"
        width="100%"
        height="100%"
        class="transition-opacity opacity-0"
        :class="{
          'opacity-100': isHovered,
        }"
      />
      <i-mdi:unfold-less-vertical
        v-else
        color="#0d650d"
        width="100%"
        height="100%"
        class="transition-opacity opacity-0"
        :class="{
          'opacity-100': isHovered,
        }"
      />
    </div>
  </div>
</template>

<script lang="ts" setup>
import { vElementHover } from '@vueuse/components';

import type { IpcRendererEvent } from '@/types/electron';

const { electron } = useElectron();

const isHovered = ref(false);
const isFullscreen = ref(false);

function minify() {
  if (isFullscreen.value) {
    return;
  }

  electron?.send('change-window', 'minify');
}

function close() {
  electron?.send('change-window', 'close');
}

function expand() {
  electron?.send('change-window', 'expand');
}

function onFullscreenEvent(_event: IpcRendererEvent, state: boolean) {
  isFullscreen.value = state;
}

onMounted(() => {
  electron?.on('fullscreen', onFullscreenEvent);
});

onBeforeUnmount(() => {
  electron?.removeListener('fullscreen', onFullscreenEvent);
});
</script>

<style scoped>
.close-button,
.minify-button,
.expand-button,
.disabled-button {
  width: 12px;
  height: 12px;
  border-radius: 20px;
  transition: 0.2s all ease-in-out;
  -webkit-app-region: no-drag;
}

.close-button:hover,
.minify-button:hover,
.expand-button:hover,
.disabled-button:hover {
  cursor: default;
}

.close-button {
  background-color: #ff5954;
  border: 0px solid #df302a;
}

.close-button:active {
  background-color: #d63f3a;
  border: 0px solid #c12e26;
}

.minify-button {
  background-color: #fdbd30;
  border: 0px solid #c18b17;
}

.minify-button:active {
  background-color: #c18b17;
  border: 0px solid #a27613;
}

.expand-button {
  background-color: #00ca3b;
  border: 0px solid #02a934;
}

.expand-button:active {
  background-color: #02a934;
  border: 0px solid #028b2b;
}

.disabled-button {
  background-color: #3d3d3d;
  border: 0px solid #282828;
}
</style>
