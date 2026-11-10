<template>
  <div class="relative overflow-hidden">
    <div v-intersection-observer="onIntersection" class="relative transition-all duration-200" :style="{ left: open ? '-75px' : '0' }">
      <Button severity="secondary" text class="cui-button p-2 block w-full" @click="onClick">
        <div class="flex gap-3">
          <div class="w-2 h-2 rounded-full mt-2" :style="{ backgroundColor: getColor(notification.severity) }" />
          <div v-if="imageSrc" class="w-14 h-10 rounded-md overflow-hidden shrink-0 self-center bg-black">
            <CuiImage v-if="seen" :src="imageSrc" alt="" :image-style="{ objectFit: 'cover' }" image-container-class="w-full h-full" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex justify-between items-center gap-2">
              <h4 class="text-sm truncate max-w-[200px]" :class="notification.seenAt == null ? 'font-semibold text-color' : 'font-medium text-muted'">
                {{ notification.title }}
              </h4>
              <div class="flex items-center gap-1.5 shrink-0">
                <span v-if="notification.seenAt == null" class="w-2 h-2 rounded-full bg-primary-500" />
                <span class="text-xs text-muted">{{ time }}</span>
              </div>
            </div>
            <p class="text-xs text-muted mt-1 text-left line-clamp-2 overflow-hidden">{{ summaryOf(notification) }}</p>
          </div>
        </div>
      </Button>
    </div>
    <div class="absolute right-0 top-0 h-full flex items-center gap-1 pr-4" :style="{ opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none' }">
      <Button
        v-if="notification.seenAt == null"
        v-tooltip.left="{ value: $t('components.notification_menu.mark_read') }"
        severity="secondary"
        class="cui-icon-sm"
        text
        rounded
        @click="emit('markSeen', notification)"
      >
        <template #icon>
          <i-mdi:check width="100%" height="100%" />
        </template>
      </Button>
      <Button
        v-tooltip.left="{ value: $t('components.notification_menu.delete') }"
        severity="danger"
        class="cui-icon-sm"
        text
        rounded
        @click="emit('remove', notification)"
      >
        <template #icon>
          <i-lucide:trash-2 width="100%" height="100%" />
        </template>
      </Button>
    </div>
    <Divider class="my-0 py-1" />
  </div>
</template>

<script setup lang="ts">
import { Severity } from '@camera.ui/sdk';
import { vIntersectionObserver } from '@vueuse/components';

import { notificationImageUrl } from '@/common/utils.js';
import { NotificationSwipeKey } from './types.js';

import type { CuiNotificationItemEmits, CuiNotificationItemProps } from './types.js';

const props = defineProps<CuiNotificationItemProps>();

const emit = defineEmits<CuiNotificationItemEmits>();

const { isTouch } = useSharedCuiUserAgent();
const { summaryOf } = useNotificationDisplay();
const swipedId = inject(NotificationSwipeKey)!;

const swipeScope = effectScope();
let swipeBound = false;
let swiping = false;
let swipeTimeoutId: ReturnType<typeof setTimeout> | undefined;

const seen = ref(false);

const open = computed(() => swipedId.value === props.notification.id);
const imageSrc = computed(() => notificationImageUrl(props.notification.imageUrl));

function onIntersection([entry]: IntersectionObserverEntry[]) {
  if (!entry.isIntersecting) {
    closeSwipe();
    return;
  }

  seen.value = true;

  if (swipeBound) {
    return;
  }

  swipeBound = true;
  swipeScope.run(() => bindSwipe(entry.target as HTMLElement));
}

function bindSwipe(target: HTMLElement) {
  onClickOutside(target, closeSwipe);

  const swipeFn = isTouch.value ? useSwipe : usePointerSwipe;

  const { direction } = swipeFn(target, {
    threshold: 10,
    disableTextSelect: true,
    onSwipe() {
      if (direction.value === 'left') {
        swiping = true;
        swipedId.value = props.notification.id;
      } else {
        swipedId.value = undefined;
      }
    },
    onSwipeEnd() {
      clearTimeout(swipeTimeoutId);
      swipeTimeoutId = setTimeout(() => {
        swiping = false;
      }, 10);
    },
  });
}

function closeSwipe() {
  if (open.value) {
    swipedId.value = undefined;
  }
}

function onClick() {
  if (swiping) {
    return;
  }

  emit('open', props.notification);
}

function getColor(severity: Severity | undefined): string {
  switch (severity) {
    case Severity.Info:
      return 'rgb(33, 150, 243)';
    case Severity.Warn:
      return 'rgb(251, 140, 0)';
    case Severity.Error:
    case Severity.Critical:
      return 'rgb(176, 0, 32)';
    default:
      return 'rgb(69, 69, 69)';
  }
}

onBeforeUnmount(closeSwipe);
</script>
