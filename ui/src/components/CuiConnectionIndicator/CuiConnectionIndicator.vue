<template>
  <Transition name="fade">
    <div v-if="visible" class="cui-connection-indicator shadow-xl" :style="{ bottom: bottomOffset }">
      <div class="cui-connection-indicator__content">
        <ProgressSpinner class="!w-5 !h-5 shrink-0" stroke-width="5" />

        <span class="cui-connection-indicator__text">
          {{ statusText }}
        </span>

        <Button v-if="showEscape" size="small" rounded class="cui-connection-indicator__button" :aria-label="t('connection.pick_server')" @click="onEscape">
          <i-mdi:cloud-outline class="w-4 h-4" />
        </Button>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { useBootMode } from '@/connection/index.js';

const { t } = useI18n();
const { bottombarHeight } = useSharedCuiStates();
const connection = useConnection();
const { bannerMode, inTrouble } = connection;
const { restarting } = useServerRestart();
const mode = useBootMode();

const authStore = useAuthStore();
const { isLoggedIn } = storeToRefs(authStore);

const bottomOffset = computed(() => `calc(${bottombarHeight.value}px + 1rem + env(safe-area-inset-bottom, 0px))`);

const visible = computed(() => isLoggedIn.value && (bannerMode.value !== null || restarting.value));

const statusText = computed(() => {
  if (bannerMode.value === 'connecting') return t('connection.connecting_remote');
  if (bannerMode.value === 'degraded') return t('connection.degraded');
  if (bannerMode.value !== null) return t('connection.reconnecting');
  return t('connection.restarting');
});

const showEscape = computed(() => inTrouble.value && mode === 'cloud');

async function onEscape() {
  const { bounceToCloudFrontend } = await import('@/connection/cloudHandoff');
  await bounceToCloudFrontend();
}
</script>

<style scoped>
.cui-connection-indicator {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  background: var(--card-background);
  border: 1px solid var(--border-color);
  max-width: calc(100vw - 2rem);
}

.cui-connection-indicator__content {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.cui-connection-indicator__text {
  font-size: 0.875rem;
  color: var(--text-color);
  white-space: nowrap;
}

.cui-connection-indicator__button {
  margin-left: 0.5rem;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
