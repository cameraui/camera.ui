<template>
  <div v-if="row" class="home-person home-person--row" :class="{ 'home-person--offline': person.offline }">
    <CuiHomeMemberIcon class="home-person__avatar" :class="{ 'home-person__avatar--home': person.home }" :sensor="person.sensor">{{ person.initial }}</CuiHomeMemberIcon>
    <span class="home-person__text">
      <span class="home-person__name">{{ person.name }}</span>
      <span class="home-person__detail">{{ person.detail }}</span>
    </span>
  </div>
  <CuiHomeMemberIcon
    v-else
    class="home-person"
    :class="{ 'home-person--named': named, 'home-person--offline': person.offline }"
    :sensor="person.sensor"
    :label="person.label"
  >
    <span class="home-person__avatar" :class="{ 'home-person__avatar--home': person.home, 'home-person__avatar--small': size < LARGE_FROM }" :style="avatarSize">
      {{ person.initial }}
    </span>
    <span v-if="named" class="home-person__line">{{ person.name }}</span>
    <span v-if="placed" class="home-person__line home-person__line--place">{{ person.place }}</span>
  </CuiHomeMemberIcon>
</template>

<script setup lang="ts">
import CuiHomeMemberIcon from './CuiHomeMemberIcon.vue';

import type { CuiHomePersonProps } from './presence.js';

const props = withDefaults(defineProps<CuiHomePersonProps>(), { size: 40 });

const LARGE_FROM = 36;

const avatarSize = computed(() => ({ width: `${props.size}px`, height: `${props.size}px` }));
</script>

<style scoped>
.home-person {
  --person-deep: color-mix(in srgb, var(--text-color) 6%, var(--p-content-hover-background));
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 0;
  border-radius: 0.75rem;
}

.home-person--offline {
  opacity: 0.55;
}

.home-person__avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--p-content-hover-background);
  color: var(--text-secondary-color);
  font-size: 0.875rem;
  font-weight: 600;
  transition:
    background 0.25s ease,
    color 0.25s ease;
}

.home-person__avatar--small {
  font-size: 0.75rem;
}

.home-person__avatar--home {
  background: color-mix(in srgb, var(--tile-ink) 18%, var(--p-content-background));
  color: var(--tile-ink);
}

.home-person--named .home-person__avatar {
  margin-bottom: 0.25rem;
}

.home-person__line {
  max-width: 100%;
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1rem;
  color: var(--text-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.home-person__line--place {
  font-weight: 400;
  color: var(--text-secondary-color);
}

.home-person--row {
  flex-direction: row;
  gap: 0.75rem;
  height: 3rem;
  padding: 0 0.5rem 0 0.625rem;
  border-radius: 1rem;
  background: var(--p-content-hover-background);
}

.home-person--row .home-person__avatar {
  width: 2rem;
  height: 2rem;
  background: var(--person-deep);
  font-size: 0.75rem;
}

.home-person--row .home-person__avatar--home {
  background: color-mix(in srgb, var(--tile-ink) 18%, var(--p-content-hover-background));
}

.home-person__text {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.home-person__name,
.home-person__detail {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.home-person__name {
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.125rem;
  color: var(--text-color);
}

.home-person__detail {
  font-size: 0.75rem;
  line-height: 1rem;
  color: var(--text-secondary-color);
}
</style>
