<template>
  <div class="contact-scene" :class="{ 'contact-scene--open': open, 'contact-scene--window': window }">
    <div class="contact-scene__frame">
      <div class="contact-scene__leaf">
        <template v-if="window">
          <span class="contact-scene__bar contact-scene__bar--across" />
          <span class="contact-scene__bar contact-scene__bar--down" />
        </template>
        <span v-else class="contact-scene__panel" />
        <span class="contact-scene__handle" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CuiContactSceneProps } from './types.js';

defineProps<CuiContactSceneProps>();
</script>

<style scoped>
.contact-scene {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 10rem;
  height: 10rem;
  perspective: 32rem;
}

.contact-scene__frame {
  position: relative;
  width: 5rem;
  height: 8.5rem;
  padding: 0.25rem;
  border-radius: 0.375rem;
  background: color-mix(in srgb, var(--text-color) 55%, var(--p-content-background));
  box-shadow: 0 0 0 3px var(--border-color);
  transition: box-shadow 0.4s ease;
}

.contact-scene--window .contact-scene__frame {
  width: 7.5rem;
  height: 6.5rem;
}

.contact-scene--open .contact-scene__frame {
  box-shadow: 0 0 0 3px var(--tile-color);
}

.contact-scene__leaf {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 0.25rem;
  background: var(--p-content-hover-background);
  box-shadow: inset 0 0 0 2px var(--border-color);
  transform-origin: left center;
  transition: transform 0.6s cubic-bezier(0.34, 1.2, 0.64, 1);
}

.contact-scene--window .contact-scene__leaf {
  background: color-mix(in srgb, #38bdf8 22%, var(--p-content-background));
}

.contact-scene--open .contact-scene__leaf {
  transform: rotateY(-58deg);
}

.contact-scene__panel {
  position: absolute;
  inset: 0.75rem 0.75rem 3rem;
  border-radius: 0.25rem;
  box-shadow: inset 0 0 0 2px var(--border-color);
}

.contact-scene__bar {
  position: absolute;
  background: var(--border-color);
}

.contact-scene__bar--across {
  left: 0;
  right: 0;
  top: 50%;
  height: 3px;
  transform: translateY(-50%);
}

.contact-scene__bar--down {
  top: 0;
  bottom: 0;
  left: 50%;
  width: 3px;
  transform: translateX(-50%);
}

.contact-scene__handle {
  position: absolute;
  right: 0.5rem;
  top: 50%;
  width: 0.375rem;
  height: 1.25rem;
  border-radius: 999px;
  background: var(--text-secondary-color);
  transform: translateY(-50%);
}

@media (prefers-reduced-motion: reduce) {
  .contact-scene__leaf {
    transition-duration: 0.01s;
  }
}
</style>
