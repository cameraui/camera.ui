<template>
  <Transition name="fade">
    <div v-if="downloads.length > 0" class="cui-download-indicator shadow-xl" :style="{ bottom: bottomOffset }">
      <div v-for="item in downloads" :key="item.id" class="cui-download-indicator__item">
        <div class="cui-download-indicator__row">
          <i-tabler:download class="cui-download-indicator__icon" />

          <div class="cui-download-indicator__text">
            <span class="cui-download-indicator__name">{{ item.filename }}</span>
            <span class="cui-download-indicator__state">{{ stateText(item) }}</span>
          </div>

          <Button severity="secondary" text rounded size="small" :aria-label="t('components.download_progress.cancel')" @click="item.cancel()">
            <template #icon>
              <i-mdi:close class="w-4 h-4" />
            </template>
          </Button>
        </div>

        <ProgressBar :mode="item.total ? 'determinate' : 'indeterminate'" :value="percent(item)" :show-value="false" class="cui-download-indicator__bar" />
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { formatBytes } from '@/common/utils.js';

const { t } = useI18n();
const { bottombarHeight } = useSharedCuiStates();
const { downloads } = useDownloadProgress();

const bottomOffset = computed(() => `calc(${bottombarHeight.value}px + 1rem + var(--safe-area-inset-bottom))`);

function stateText(item: DownloadProgress): string {
  if (item.loaded === 0) return t('components.download_progress.preparing');
  if (!item.total) return formatBytes(item.loaded);
  return t('components.download_progress.progress', { loaded: formatBytes(item.loaded), total: formatBytes(item.total) });
}

function percent(item: DownloadProgress): number {
  return item.total ? Math.min(100, (item.loaded / item.total) * 100) : 0;
}
</script>

<style scoped>
.cui-download-indicator {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: min(22rem, calc(100vw - 2rem));
  padding: 0.75rem 0.5rem 0.75rem 1rem;
  border-radius: 0.5rem;
  background: var(--card-background);
  border: 1px solid var(--border-color);
}

.cui-download-indicator__row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.cui-download-indicator__icon {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  color: var(--text-color);
}

.cui-download-indicator__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.cui-download-indicator__name {
  overflow: hidden;
  font-size: 0.875rem;
  color: var(--text-color);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cui-download-indicator__state {
  font-size: 0.75rem;
  color: var(--text-muted-color);
}

.cui-download-indicator__bar {
  height: 3px;
  margin: 0.5rem 0.5rem 0 0;
}

.fade-enter-active {
  transition: opacity 0.2s ease 0.3s;
}

.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
