<template>
  <Button severity="secondary" text class="cui-button p-2 text-color" @click="toggleTheme">
    <i-icon-park-solid:dark-mode v-if="autoMode" class="w-6 h-6" />
    <i-material-symbols:dark-mode v-else-if="theme === 'dark'" class="w-6 h-6" />
    <i-material-symbols:light-mode-rounded v-else-if="theme === 'light'" class="w-6 h-6" />
  </Button>
</template>

<script setup lang="ts">
const themeStore = useThemeStore();
const { theme, autoMode } = storeToRefs(themeStore);

function toggleTheme() {
  themeStore.toggleTheme();
}
</script>

<style scoped></style>
