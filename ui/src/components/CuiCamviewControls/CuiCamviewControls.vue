<template>
  <div class="flex items-end pointer-events-none">
    <Transition name="camview-controls" mode="out-in">
      <div
        v-if="!collapsed"
        key="bar"
        class="camview-controls-bar relative mx-auto mb-3 grid grid-cols-[1fr_auto_1fr] items-center rounded-full py-1 px-7 pointer-events-auto"
      >
        <div class="flex items-center justify-end gap-0.5 sm:gap-1">
          <Button
            v-for="item in start"
            :key="item.id"
            v-tooltip.top="{ value: item.label }"
            text
            rounded
            severity="contrast"
            :disabled
            :aria-label="item.label"
            class="camview-control"
            @click="item.onClick"
          >
            <template #icon>
              <component :is="item.icon" class="w-5 h-5" />
            </template>
          </Button>
        </div>

        <Button
          v-tooltip.top="{ value: $t('components.form.tooltip.intercom') }"
          rounded
          :disabled="disabled || !micAvailable"
          :loading="micLoading"
          :aria-label="$t('components.form.tooltip.intercom')"
          :aria-pressed="micActive"
          class="camview-mic"
          :class="{ 'camview-mic-active': micActive }"
          @click="emit('mic')"
        >
          <template #icon>
            <i-mage:microphone-fill v-if="micActive" class="w-6 h-6" />
            <i-mage:microphone-mute-fill v-else class="w-6 h-6" />
          </template>
        </Button>

        <div class="flex items-center justify-start gap-0.5 sm:gap-1">
          <Button
            v-for="item in end"
            :key="item.id"
            v-tooltip.top="{ value: item.label }"
            text
            rounded
            severity="contrast"
            :disabled
            :aria-label="item.label"
            class="camview-control"
            @click="item.onClick"
          >
            <template #icon>
              <component :is="item.icon" class="w-5 h-5" />
            </template>
          </Button>
        </div>

        <button
          v-tooltip.top="{ value: $t('views.camview.controls_hide') }"
          type="button"
          class="camview-controls-hide"
          :aria-label="$t('views.camview.controls_hide')"
          @click="collapsed = true"
        >
          <i-tabler:chevron-down class="w-4 h-4" />
        </button>
      </div>

      <Button
        v-else-if="fab"
        key="fab"
        v-tooltip.left="{ value: $t('views.camview.controls_show') }"
        severity="secondary"
        rounded
        :aria-label="$t('views.camview.controls_show')"
        class="ml-auto shadow-lg opacity-40 hover:opacity-100 focus:opacity-100 transition pointer-events-auto"
        @click="collapsed = false"
      >
        <template #icon>
          <i-tabler:layout-bottombar-expand class="w-6 h-6" />
        </template>
      </Button>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import type { CuiCamviewControlsEmits, CuiCamviewControlsProps } from './types.js';

withDefaults(defineProps<CuiCamviewControlsProps>(), { fab: true });

const emit = defineEmits<CuiCamviewControlsEmits>();

const collapsed = defineModel<boolean>('collapsed', { required: true });
</script>

<style scoped>
.camview-controls-bar {
  background: rgba(15, 15, 15, 0.85);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.camview-control {
  width: 36px;
  height: 36px;
}

.camview-mic {
  width: 56px;
  height: 56px;
  margin: -8px 4px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.45);
}

.camview-mic-active {
  animation: camview-mic-pulse 1.6s ease-out infinite;
}

.camview-controls-hide {
  position: absolute;
  top: 50%;
  right: 4px;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 36px;
  border-radius: 999px;
  color: var(--text-muted-color);
  cursor: pointer;
  transition: color 0.15s ease;
}

.camview-controls-hide:hover,
.camview-controls-hide:focus-visible {
  color: var(--text-color);
}

.camview-controls-enter-active,
.camview-controls-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.camview-controls-enter-from,
.camview-controls-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.92);
}

@media (min-width: 40rem) {
  .camview-control {
    width: 40px;
    height: 40px;
  }
}

@keyframes camview-mic-pulse {
  0% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--p-primary-color) 55%, transparent);
  }
  100% {
    box-shadow: 0 0 0 14px transparent;
  }
}
</style>
