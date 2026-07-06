<template>
  <Transition name="fade">
    <div v-if="updateAvailable" class="cui-update-indicator shadow-xl" :style="{ bottom: bottomOffset }">
      <div class="cui-update-indicator__content">
        <ProgressSpinner v-if="isApplying" class="cui-update-indicator__spinner" stroke-width="5" />
        <i-iconoir:download class="cui-update-indicator__icon" v-else />

        <span class="cui-update-indicator__text">
          {{ isApplying ? t('components.toast.update_applying') : t('components.toast.update_available_title') }}
        </span>

        <Button v-if="!isApplying" size="small" class="cui-update-indicator__button" :label="t('components.toast.update_now')" @click="onApply" />
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
const { t } = useI18n();
const { bottombarHeight } = useSharedCuiStates();
const { updateAvailable: updateAvailableState, isApplying, applyUpdate } = useAppUpdate();

const authStore = useAuthStore();
const { isLoggedIn } = storeToRefs(authStore);

const connection = useConnection();

const updateAvailable = computed(() => isLoggedIn.value && updateAvailableState.value && connection.bannerMode.value === null);
const bottomOffset = computed(() => `calc(${bottombarHeight.value}px + 1rem + env(safe-area-inset-bottom, 0px))`);

function onApply() {
  applyUpdate();
}
</script>

<style scoped>
.cui-update-indicator {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  background: var(--card-background);
  border: 1px solid var(--border-color);
}

.cui-update-indicator__content {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.cui-update-indicator__spinner {
  width: 20px !important;
  height: 20px !important;
}

.cui-update-indicator__icon {
  width: 20px;
  height: 20px;
  color: var(--text-color);
}

.cui-update-indicator__text {
  font-size: 0.875rem;
  color: var(--text-color);
  white-space: nowrap;
}

.cui-update-indicator__button {
  margin-left: 0.5rem;
  white-space: nowrap;
}

/* Fade transition */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
