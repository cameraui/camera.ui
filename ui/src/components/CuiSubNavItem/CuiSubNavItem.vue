<template>
  <RouterLink v-slot="{ isExactActive }" :to>
    <Button
      text
      severity="secondary"
      class="subnavitem-button w-full h-[120px] flex items-start justify-start p-6 bg-none text-color hover:!text-primary active:!text-primary focus:!text-primary rounded-none"
      :class="{
        'active !text-primary': isExactActive,
      }"
      fluid
    >
      <div v-if="(icon && !isExactActive) || !activeIcon">
        <icon class="w-[24px] h-[24px]" />
      </div>
      <div v-else-if="activeIcon && isExactActive">
        <activeIcon class="w-[24px] h-[24px]" />
      </div>

      <div class="overflow-hidden w-full">
        <div class="ml-2 flex flex-row items-center justify-between">
          <div class="text-start flex-1">
            <div class="text-sm font-bold max-w-100 truncate">
              {{ label }}
            </div>
            <div v-if="description" class="text-sm text-muted font-normal">
              {{ description }}
            </div>
          </div>
        </div>
      </div>
    </Button>
  </RouterLink>
</template>

<script setup lang="ts">
import type { CuiSubNavItemProps } from './types.js';

const props = defineProps<CuiSubNavItemProps>();

const { icon, activeIcon, label, description, to } = toRefs(props);
</script>

<style scoped>
.subnavitem-button {
  background: var(--subnavbar-item-background);
  border-color: transparent;
  /* color: var(--p-button-text-secondary-color); */
}

.subnavitem-button:hover {
  background: var(--subnavbar-item-hover-background);
  border-color: transparent;
  /* color: var(--p-button-text-secondary-color); */
}

.subnavitem-button:active,
.subnavitem-button.active {
  background: var(--subnavbar-item-active-background);
  border-color: transparent;
  /* color: var(--p-button-text-secondary-color); */
}
</style>
