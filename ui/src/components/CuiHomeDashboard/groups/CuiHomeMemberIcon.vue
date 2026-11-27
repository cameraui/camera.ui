<template>
  <button
    v-if="sensor && open"
    type="button"
    class="home-member-icon"
    :aria-label="label ?? t('views.home_dashboard.show_sensor', { name: sensor.displayName.value })"
    @click="open(sensor, $event)"
  >
    <slot />
  </button>
  <span v-else><slot /></span>
</template>

<script setup lang="ts">
import { HOME_MEMBER_OPEN } from './memberSheet.js';

import type { CuiHomeMemberIconProps } from './memberSheet.js';

defineProps<CuiHomeMemberIconProps>();

const { t } = useI18n();

const open = inject(HOME_MEMBER_OPEN, undefined);
</script>

<style scoped>
.home-member-icon {
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.home-member-icon:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
}
</style>
