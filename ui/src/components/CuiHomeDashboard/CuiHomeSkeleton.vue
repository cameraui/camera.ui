<template>
  <div
    class="home-skeleton"
    :style="{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gridAutoRows: `${cell}px`, gap: `${gap}px` }"
    aria-busy="true"
    :aria-label="t('views.home_dashboard.loading')"
  >
    <Skeleton
      v-for="(position, index) in positions"
      :key="index"
      class="home-skeleton__block"
      width="100%"
      height="100%"
      :style="{ gridColumn: `${position.x + 1} / span ${position.w}`, gridRow: `${position.y + 1} / span ${position.h}` }"
    />
  </div>
</template>

<script setup lang="ts">
import { skeletonLayout } from './layout.js';

import type { CuiHomeSkeletonProps } from './types.js';

const props = defineProps<CuiHomeSkeletonProps>();

const { t } = useI18n();

const rootRef = useCurrentElement<HTMLElement>();
const { width } = useElementSize(rootRef);
const { top } = useElementBounding(rootRef);
const { height: viewHeight } = useWindowSize();

const cell = computed(() => Math.max(0, (width.value - props.gap * (props.columns - 1)) / props.columns));
const positions = computed(() => {
  const rows = cell.value ? Math.ceil((viewHeight.value - top.value) / (cell.value + props.gap)) : 3;
  return skeletonLayout(props.columns, Math.max(3, rows));
});
</script>

<style scoped>
.home-skeleton {
  display: grid;
}

.home-skeleton__block {
  border-radius: 1.5rem;
}
</style>
