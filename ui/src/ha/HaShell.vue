<template>
  <CuiToast />
  <ConfirmPopup />
  <DynamicDialog />
  <Teleport v-for="mount in mountList" :key="mount.id" :to="mount.el">
    <component :is="mount.component" v-bind="mount.props" />
  </Teleport>
</template>

<script setup lang="ts">
import type { CardMount } from './shell.js';

const props = defineProps<{ mounts: Map<number, CardMount> }>();

const mountList = computed(() => Array.from(props.mounts.values()));
</script>
