<template>
  <Transition name="fade">
    <div v-if="visible" class="cui-push-sync-indicator shadow-xl" :style="{ bottom: bottomOffset }">
      <div class="cui-push-sync-indicator__content">
        <ProgressSpinner v-if="repairing" class="cui-push-sync-indicator__spinner" stroke-width="5" />
        <i-mdi:bell-off-outline v-else class="cui-push-sync-indicator__icon" />

        <span class="cui-push-sync-indicator__text">{{ t('components.push_sync.title') }}</span>

        <Button v-if="!repairing" size="small" class="cui-push-sync-indicator__button" :label="t('components.push_sync.action')" @click="repair" />

        <Button
          v-if="!repairing"
          severity="secondary"
          text
          rounded
          size="small"
          class="cui-push-sync-indicator__dismiss"
          :aria-label="t('components.push_sync.dismiss')"
          @click="dismiss"
        >
          <template #icon>
            <i-mdi:close class="w-4 h-4" />
          </template>
        </Button>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
const { t } = useI18n();
const { bottombarHeight } = useSharedCuiStates();
const { needsAction, repairing, repair, dismiss } = usePushSync();

const { updateAvailable } = useAppUpdate();
const connection = useConnection();

const visible = computed(() => needsAction.value && connection.bannerMode.value === null && !updateAvailable.value);
const bottomOffset = computed(() => `calc(${bottombarHeight.value}px + 1rem + var(--safe-area-inset-bottom))`);
</script>

<style scoped>
.cui-push-sync-indicator {
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

.cui-push-sync-indicator__content {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.cui-push-sync-indicator__spinner {
  width: 20px !important;
  height: 20px !important;
}

.cui-push-sync-indicator__icon {
  width: 20px;
  height: 20px;
  color: var(--text-color);
}

.cui-push-sync-indicator__text {
  font-size: 0.875rem;
  color: var(--text-color);
  white-space: nowrap;
}

.cui-push-sync-indicator__button {
  margin-left: 0.5rem;
  white-space: nowrap;
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
