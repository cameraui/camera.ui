<template>
  <Transition name="fade">
    <div v-if="active" class="cui-restore-overlay">
      <div class="cui-restore-overlay__card shadow-xl">
        <InlineSvg :src="getImageUrl('logo_animated.svg')" width="52px" height="58px" title="camera.ui" aria-label="camera.ui" />

        <span class="text-lg font-semibold">{{ $t('restore.title') }}</span>

        <span class="text-sm text-muted">{{ phaseText }}</span>

        <ProgressBar v-if="phase === 'uploading'" :value="uploadPercent" class="w-full" />
        <ProgressBar v-else mode="indeterminate" class="w-full" style="height: 6px" />

        <span class="text-xs text-muted">{{ $t('restore.dont_close') }}</span>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import InlineSvg from 'vue-inline-svg';

import { getImageUrl } from '@/common/utils.js';

const { t } = useI18n();

const { active, phase, uploadPercent } = useBackupRestore();

const phaseText = computed(() => {
  switch (phase.value) {
    case 'uploading':
      return t('restore.phase_uploading');
    case 'restarting':
      return t('restore.phase_restarting');
    default:
      return t('restore.phase_restoring');
  }
});
</script>

<style scoped>
.cui-restore-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
}

.cui-restore-overlay__card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  width: 100%;
  max-width: 360px;
  padding: 2rem 1.5rem;
  border-radius: 0.75rem;
  background: var(--card-background);
  border: 1px solid var(--border-color);
  text-align: center;
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
