<template>
  <div v-if="isLocked" class="app-lock-overlay">
    <div class="flex flex-col items-center gap-6 p-8">
      <i-mdi:lock class="w-16 h-16 text-muted" />
      <div class="text-center">
        <h2 class="text-lg font-semibold">{{ $t('views.app_lock.title') }}</h2>
        <p class="text-sm text-muted mt-2">{{ $t('views.app_lock.subtitle') }}</p>
      </div>
      <Button :label="$t('views.app_lock.unlock')" :loading="unlocking" fluid class="cui-button-medium" @click="onUnlock">
        <template #icon>
          <i-mdi:fingerprint class="mr-2" />
        </template>
      </Button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { useAppLock } from '@/composables/useAppLock.js';

const { isLocked, unlock } = useAppLock();
const unlocking = ref(false);

async function onUnlock() {
  unlocking.value = true;
  try {
    await unlock();
  } finally {
    unlocking.value = false;
  }
}

watch(
  isLocked,
  async (locked) => {
    if (locked) {
      await nextTick();
      await onUnlock();
    }
  },
  { immediate: true },
);
</script>

<style scoped>
.app-lock-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ground-background);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}
</style>
