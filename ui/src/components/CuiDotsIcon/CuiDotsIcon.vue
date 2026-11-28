<template>
  <span class="cui-dots" :class="{ 'cui-dots--open': open }" aria-hidden="true">
    <span class="cui-dots__dot cui-dots__dot--top" />
    <span class="cui-dots__dot cui-dots__dot--middle" />
    <span class="cui-dots__dot cui-dots__dot--bottom" />
  </span>
</template>

<script setup lang="ts">
import type { CuiDotsIconProps } from './types.js';

defineProps<CuiDotsIconProps>();
</script>

<style scoped>
.cui-dots {
  --dot: var(--cui-dots-size, 6px);
  --gap: var(--cui-dots-gap, 1px);
  --line: var(--cui-dots-line, 16px);
  position: relative;
  display: block;
  flex-shrink: 0;
  width: calc(var(--dot) * 3 + var(--gap) * 2);
  height: calc(var(--dot) * 3 + var(--gap) * 2);
}

.cui-dots__dot {
  position: absolute;
  left: calc(var(--dot) + var(--gap));
  width: var(--dot);
  height: var(--dot);
  border-radius: 9999px;
  background: currentColor;
  transition:
    top 0.1s,
    left 0.1s,
    width 0.1s,
    height 0.1s,
    border-radius 0.1s,
    rotate 0.1s,
    opacity 0.1s,
    scale 0.1s;
}

.cui-dots__dot--top {
  top: 0;
}

.cui-dots__dot--middle {
  top: calc(var(--dot) + var(--gap));
}

.cui-dots__dot--bottom {
  top: calc((var(--dot) + var(--gap)) * 2);
}

.cui-dots--open .cui-dots__dot--top,
.cui-dots--open .cui-dots__dot--bottom {
  top: calc((var(--dot) * 3 + var(--gap) * 2) / 2 - 1px);
  left: calc((var(--dot) * 3 + var(--gap) * 2 - var(--line)) / 2);
  width: var(--line);
  height: 2px;
  border-radius: 0;
}

.cui-dots--open .cui-dots__dot--top {
  rotate: 45deg;
}

.cui-dots--open .cui-dots__dot--middle {
  opacity: 0;
  scale: 0;
}

.cui-dots--open .cui-dots__dot--bottom {
  rotate: -45deg;
}
</style>
