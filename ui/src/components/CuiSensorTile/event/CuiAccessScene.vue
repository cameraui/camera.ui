<template>
  <div class="access-scene" :class="{ 'access-scene--active': active, 'access-scene--known': granted !== undefined }">
    <component :is="methodIcon" class="access-scene__method" />
    <span v-if="active && granted !== undefined" class="access-scene__badge">
      <component :is="granted ? GrantedIcon : DeniedIcon" />
    </span>
  </div>
</template>

<script setup lang="ts">
import { AccessMethod } from '@camera.ui/sdk';
import AppIcon from '~icons/mdi/cellphone-key';
import DeniedIcon from '~icons/mdi/close-thick';
import GrantedIcon from '~icons/mdi/check-bold';
import FaceIcon from '~icons/mdi/face-recognition';
import FingerprintIcon from '~icons/mdi/fingerprint';
import UnknownIcon from '~icons/mdi/key-chain-variant';
import NfcIcon from '~icons/mdi/nfc-variant';
import PinIcon from '~icons/mdi/dialpad';

import type { CuiAccessSceneProps } from './types.js';
import type { Component } from 'vue';

const METHOD_ICONS: Record<string, Component> = {
  [AccessMethod.Fingerprint]: FingerprintIcon,
  [AccessMethod.Nfc]: NfcIcon,
  [AccessMethod.Pin]: PinIcon,
  [AccessMethod.Face]: FaceIcon,
  [AccessMethod.App]: AppIcon,
};

const props = defineProps<CuiAccessSceneProps>();

const methodIcon = computed(() => (props.method && METHOD_ICONS[props.method]) || UnknownIcon);
</script>

<style scoped>
.access-scene {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 7.5rem;
  height: 7.5rem;
  border-radius: 50%;
  border: 3px solid var(--border-color);
  color: var(--text-secondary-color);
  transition:
    border-color 0.3s ease,
    background 0.3s ease,
    color 0.3s ease;
}

.access-scene--known {
  border-color: var(--tile-color);
  color: var(--tile-color);
}

.access-scene--active {
  background: color-mix(in srgb, var(--tile-color) 18%, transparent);
}

.access-scene__method {
  width: 3.25rem;
  height: 3.25rem;
}

.access-scene__badge {
  position: absolute;
  right: -0.25rem;
  bottom: -0.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 50%;
  font-size: 1.125rem;
  color: var(--p-content-background);
  background: var(--tile-color);
  border: 3px solid var(--p-content-background);
}
</style>
