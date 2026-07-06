<template>
  <Button ref="buttonRef" :class="itemClasses" :disabled :loading text size="small" :rounded="isIconOnly" @click="handleClick">
    <template #default>
      <div
        class="flex items-center gap-1.5"
        :class="{
          'cursor-not-allowed': disabled,
        }"
      >
        <template v-if="status">
          <span v-if="status === 'connected'" class="w-2 h-2 rounded-full bg-green-500 shrink-0" />
          <i-svg-spinners:ring-resize v-else-if="status === 'connecting'" class="w-3 h-3 text-yellow-500 shrink-0" />
          <span v-else class="w-2 h-2 rounded-full bg-red-500 shrink-0" />
        </template>

        <slot name="icon" />

        <span v-if="label" class="cui-topnavbar-item-label">{{ label }}</span>

        <Badge v-if="badge" :value="badge" :severity="badgeSeverity" class="ml-1" />

        <i-mdi:chevron-down v-if="type === 'dropdown'" class="w-4 h-4 transform transition-transform duration-300" :class="{ 'rotate-180': menuOpen }" />

        <Button v-if="closeable" severity="secondary" text rounded class="!p-0 !w-5 !h-5 ml-1" @click.stop="$emit('close')">
          <template #icon>
            <i-mdi:close class="w-3 h-3 opacity-60 hover:opacity-100" />
          </template>
        </Button>
      </div>
    </template>
  </Button>
</template>

<script setup lang="ts">
import type { CuiTopNavbarItemEmits, CuiTopNavbarItemProps } from './types.js';

const props = withDefaults(defineProps<CuiTopNavbarItemProps>(), {
  type: 'button',
  active: false,
  disabled: false,
  severity: 'secondary',
  badgeSeverity: 'secondary',
});

const emit = defineEmits<CuiTopNavbarItemEmits>();

const { type, label, active, disabled, badge, badgeSeverity, closeable, status, loading, menuOpen, primary } = toRefs(props);

const buttonRef = useTemplateRef<{ $el: HTMLElement }>('buttonRef');

const isIconOnly = computed(() => !label.value && type.value === 'button');
const itemClasses = computed(() => [
  'shrink-0',
  {
    'cui-topnavbar-item': !primary.value,
    'cui-topnavbar-item-primary': primary.value,
    'cui-topnavbar-item-active': active.value,
    'cui-topnavbar-item-tab': type.value === 'tab',
    'cui-topnavbar-item-dropdown': type.value === 'dropdown',
    'cui-icon-md': isIconOnly.value,
    disabled: disabled.value,
  },
]);

function handleClick(event: MouseEvent) {
  if (!disabled.value) {
    emit('click', event);
  }
}

watch(
  active,
  (isActive) => {
    if (isActive) {
      nextTick(() => {
        buttonRef.value?.$el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      });
    }
  },
  { immediate: true },
);
</script>

<style scoped>
.cui-topnavbar-item {
  background: var(--cui-topnavbar-item-bg);
  color: var(--cui-topnavbar-item-color);
}

.cui-topnavbar-item-primary {
  background: var(--primary-500);
  color: var(--p-button-primary-color);
}

.cui-topnavbar-item-primary:hover:not(.disabled) {
  background: var(--primary-600);
  color: var(--p-button-primary-color);
}

.cui-topnavbar-item-primary:active:not(.disabled) {
  background: var(--primary-700) !important;
  color: var(--p-button-primary-color);
}

.cui-topnavbar-item:hover:not(.disabled) {
  background: var(--cui-topnavbar-item-hover-bg);
}

.cui-topnavbar-item:active:not(.disabled),
.cui-topnavbar-item-active:not(.cui-topnavbar-item-primary):not(.disabled) {
  background: var(--cui-topnavbar-item-active-bg) !important;
  color: var(--cui-topnavbar-item-active-color);
}

.cui-topnavbar-item-label {
  font-size: 0.875rem;
  white-space: nowrap;
}

/* Tab-specific styling */
.cui-topnavbar-item-tab {
  padding: 0.5rem 0.5rem;
}

/* Dropdown-specific styling */
.cui-topnavbar-item-dropdown {
  padding-right: 0.5rem;
}
</style>
