<template>
  <div ref="buttonRef" class="relative">
    <Button v-bind="buttonProps" :label="label" @click="handleAction">
      <template v-if="icon" #icon>
        <div class="relative">
          <component :is="icon" :class="iconClass" />
        </div>
      </template>
    </Button>

    <Teleport to="body">
      <Transition name="fade">
        <Button
          v-if="isActionVisible"
          as="div"
          v-bind="tooltipProps"
          class="fixed text-xs px-2 py-1 rounded whitespace-nowrap z-[99999] cursor-default pointer-events-none"
          :style="tooltipStyle"
          :label="actionText"
        />
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import type { CuiActionButtonEmits, CuiActionButtonProps } from './types.js';

const props = withDefaults(defineProps<CuiActionButtonProps>(), {
  actionDuration: 1500,
});

const emit = defineEmits<CuiActionButtonEmits>();

const { label, icon, iconClass, buttonProps, actionText, actionDuration, tooltipProps } = toRefs(props);
const buttonRef = useTemplateRef('buttonRef');
const isActionVisible = ref(false);

const buttonRect = useElementBounding(buttonRef);

const { start: startActionTimeout } = useTimeoutFn(
  () => {
    isActionVisible.value = false;
  },
  actionDuration,
  { immediate: false },
);

const tooltipStyle = computed<HTMLAttributes['style']>(() => {
  return {
    top: `${buttonRect.top.value}px`,
    left: `${buttonRect.left.value}px`,
    transform: 'translate(-50%, -100%)',
    marginTop: '-8px',
  };
});

function handleAction(event: Event) {
  isActionVisible.value = false;
  emit('action', event);
  isActionVisible.value = true;
  startActionTimeout();
}
</script>
