<template>
  <div class="group relative flex items-center w-full">
    <DefineTemplate v-slot="{ isExactActive }">
      <Button
        v-tooltip="{ value: tooltip }"
        text
        fluid
        :disabled
        severity="contrast"
        class="cui-button inset-0"
        :class="[
          {
            active: active || isExactActive,
            // 'cursor-not-allowed disabled': disabled,
            '!rounded-none': radius === 'none',
            '!rounded-t-xl !rounded-b-none': radius === 'top',
            '!rounded-b-xl !rounded-t-none': radius === 'bottom',
            '!rounded-xl': radius === 'both',
          },
          active || isExactActive ? activeClass : undefined,
        ]"
        v-bind="buttonProps"
        @click="handleClick"
      >
        <template #default>
          <div
            class="relative z-10 flex items-center w-full px-3"
            :class="{
              'py-2': size !== 'large',
              'py-3.5': size === 'large',
            }"
          >
            <div v-if="$slots.prepend" class="flex items-center mr-3 pointer-events-auto" data-cui-slot-interactive>
              <slot name="prepend" :is-exact-active="isExactActive ?? false"></slot>
            </div>

            <div class="flex-1 min-w-0 text-left">
              <div class="text-sm font-medium truncate">
                <slot :is-exact-active="isExactActive ?? false"></slot>
              </div>

              <div v-if="$slots.subtitle" :is-exact-active="isExactActive ?? false" class="text-sm text-muted mt-0.5">
                <slot name="subtitle"></slot>
              </div>
            </div>

            <div v-if="$slots.append" :is-exact-active="isExactActive ?? false" class="flex items-center ml-auto pl-3 pointer-events-auto" data-cui-slot-interactive>
              <slot name="append"></slot>
            </div>
          </div>
        </template>
      </Button>
      <div class="w-full h-[1px] divider" v-if="divider"></div>
    </DefineTemplate>

    <RouterLink v-if="to" v-slot="{ isExactActive }" :to class="block transition-all duration-300 w-full">
      <ReuseTemplate :is-exact-active="isExactActive" />
    </RouterLink>

    <div class="w-full" v-else>
      <ReuseTemplate />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CuiListItemEmits, CuiListItemProps } from './types.js';

const props = defineProps<CuiListItemProps>();

const emit = defineEmits<CuiListItemEmits>();

const { disabled, active, to, activeClass, buttonProps, tooltip, size, divider, radius } = toRefs(props);

const [DefineTemplate, ReuseTemplate] = createReusableTemplate<{ isExactActive?: boolean }>();

function handleClick(event: MouseEvent) {
  if (disabled.value) return;

  // Don't fire when the click originated from an interactive element inside prepend/append slots
  const target = event.target as HTMLElement;
  if (target.closest('[data-cui-slot-interactive]')) return;

  emit('click', event);
}
</script>

<style scoped>
/*
.listitem-button {
  background: var(--button-contrast-background);
  border-color: transparent;
  color: var(--p-button-text-secondary-color);
}

.listitem-button:hover:not(.disabled),
.listitem-button.active:not(.disabled) {
  background: var(--button-contrast-hover-background);
  border-color: transparent;
  color: var(--p-button-text-secondary-color);
}

.listitem-button:active:not(.disabled) {
  background: var(--button-contrast-active-background);
  border-color: transparent;
  color: var(--p-button-text-secondary-color);
}
  */

.divider {
  background: var(--divider-color);
}
</style>
