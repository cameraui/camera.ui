<template>
  <div>
    <Button severity="secondary" text class="cui-button p-2 text-color" @click="toggleMenu">
      <template #icon>
        <i-solar:bell-bold class="w-6 h-6" />
        <Badge v-if="notificationsEnabled && unreadCount" class="absolute min-w-[8px] w-[8px] h-[8px] right-[10px] top-[7px]"></Badge>
      </template>
    </Button>
    <Popover
      ref="notificationsMenuRef"
      append-to="self"
      class="w-[20rem] shadow-lg cui-rounded-corner notification-menu isolate overscroll-contain non-draggable-region"
      @hide="onHide"
    >
      <div v-if="!settingsResolved" class="flex items-center justify-center py-8">
        <ProgressSpinner class="w-[30px] h-[30px] m-0" stroke-width="5" />
      </div>

      <div v-else-if="!notificationsEnabled" class="flex flex-col items-center text-center gap-3 py-6 px-2">
        <i-mdi:bell-off-outline class="w-8 h-8 text-muted" />
        <div>
          <h3 class="text-sm font-semibold text-color">{{ $t('components.notification_menu.disabled') }}</h3>
          <p class="text-xs text-muted mt-1">{{ $t('components.notification_menu.disabled_hint') }}</p>
        </div>
        <Button class="cui-button-small" :label="$t('components.notification_menu.open_settings')" @click="goToSettings" />
      </div>

      <template v-else>
        <div class="flex justify-between items-center mb-4 h-9">
          <div class="flex items-center gap-2">
            <h3 class="text-base font-semibold">{{ $t('components.notification_menu.notifications') }}</h3>
            <Badge class="rounded-full text-xs p-1" :value="notifications.length > 99 ? '99+' : String(notifications.length)" />
          </div>
          <div class="flex items-center gap-1">
            <Button
              v-if="unreadCount"
              v-tooltip.left="{ value: $t('components.notification_menu.mark_all_read') }"
              severity="secondary"
              text
              rounded
              class="p-2 cui-icon-md"
              @click="markAllSeen"
            >
              <template #icon>
                <i-mdi:check-all width="100%" height="100%" />
              </template>
            </Button>
            <Button
              v-if="notifications.length"
              v-tooltip.left="{ value: $t('components.notification_menu.clear_notifications') }"
              severity="danger"
              text
              rounded
              class="p-2 cui-icon-md"
              @click="clearNotifications"
            >
              <template #icon>
                <i-lucide:trash-2 width="100%" height="100%" />
              </template>
            </Button>
          </div>
        </div>

        <div
          class="overflow-y-auto"
          :style="{
            maxHeight: `234px`,
          }"
        >
          <div v-for="notification in notifications" :key="notification.id" class="relative overflow-hidden">
            <div
              v-intersection-observer="(e) => initializeSwipe(notification.id, e)"
              class="relative transition-all duration-200"
              :style="{
                left: swipeStates[notification.id]?.left || '0',
                opacity: swipeStates[notification.id]?.opacity || 1,
              }"
            >
              <Button severity="secondary" text class="cui-button p-2 block w-full" @click="openDialog(notification)">
                <div class="flex gap-3">
                  <div class="w-2 h-2 rounded-full mt-2" :style="{ backgroundColor: getColor(notification.severity) }" />
                  <div class="flex-1 min-w-0">
                    <div class="flex justify-between items-center gap-2">
                      <h4 class="text-sm truncate max-w-[200px]" :class="notification.seenAt == null ? 'font-semibold text-color' : 'font-medium text-muted'">
                        {{ notification.title }}
                      </h4>
                      <div class="flex items-center gap-1.5 shrink-0">
                        <span v-if="notification.seenAt == null" class="w-2 h-2 rounded-full bg-primary-500" />
                        <span class="text-xs text-muted">{{ formatTimestamp(notification.createdAt) }}</span>
                      </div>
                    </div>
                    <p class="text-xs text-muted mt-1 text-left line-clamp-2 overflow-hidden">{{ notification.subtitle || notification.body }}</p>
                  </div>
                </div>
              </Button>
            </div>
            <div
              class="absolute right-0 top-0 h-full flex items-center gap-1 pr-4"
              :style="{
                opacity: swipeStates[notification.id]?.deleteOpacity || 0,
                pointerEvents: (swipeStates[notification.id]?.deleteOpacity || 0) > 0 ? 'auto' : 'none',
              }"
            >
              <Button
                v-if="notification.seenAt == null"
                v-tooltip.left="{ value: $t('components.notification_menu.mark_read') }"
                severity="secondary"
                class="cui-icon-sm"
                text
                rounded
                @click="markSeen(notification)"
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
                @click="removeNotification(notification)"
              >
                <template #icon>
                  <i-lucide:trash-2 width="100%" height="100%" />
                </template>
              </Button>
            </div>
            <Divider v-if="notifications.indexOf(notification) !== notifications.length - 1" class="my-0 py-1" />
          </div>
        </div>

        <div v-if="notifications.length === 0" class="text-center py-8 text-muted text-sm">
          {{ $t('components.notification_menu.no_notifications') }}
        </div>
      </template>
    </Popover>
  </div>
</template>

<script setup lang="ts">
import { Severity } from '@camera.ui/sdk';
import { vIntersectionObserver } from '@vueuse/components';

import { NotificationsQuery } from '@/api/routes/notifications.js';

import type { IpcRendererEvent } from '@/types/electron';
import type { StoredNotification } from '@shared/types';
import type { Popover } from 'primevue';

const router = useRouter();
const dialog = useCuiDialog();
const { t } = useI18n();
const { isTouch } = useSharedCuiUserAgent();
const { isElectronApp, electron } = useElectron();

const notificationsQuery = new NotificationsQuery();

const notificationsSocket = useNotificationsSocket();

const { data: settings, isLoading: settingsLoading } = notificationsQuery.getSettingsQuery();

const notificationsMenuRef = useTemplateRef<InstanceType<typeof Popover>>('notificationsMenuRef');
const swipeStates = ref<Record<string, { left: string; opacity: number; deleteOpacity: number; isSwiping: boolean; resetFn: () => void; stopFn: () => void }>>({});

const notifications = computed(() => notificationsSocket.notifications.value);
const unreadCount = computed(() => notificationsSocket.unreadCount.value);
const notificationsEnabled = computed(() => settings.value?.enabled ?? false);
const settingsResolved = computed(() => !settingsLoading.value || settings.value !== undefined);

function initializeSwipe(notificationId: string, [entry]: IntersectionObserverEntry[]) {
  if (!entry.isIntersecting) {
    swipeStates.value[notificationId]?.resetFn();
    swipeStates.value[notificationId]?.stopFn();
    delete swipeStates.value[notificationId];
    return;
  }

  if (swipeStates.value[notificationId]) {
    return;
  }

  const target = entry.target as HTMLElement;
  const container = target.parentElement;

  if (!container) {
    return;
  }

  const stopOnClickOutside = onClickOutside(target, () => {
    if (swipeStates.value[notificationId]) {
      swipeStates.value[notificationId].resetFn();
    }
  });

  let swipeTimeoutId: ReturnType<typeof setInterval>;
  const swipeFn = isTouch.value ? useSwipe : usePointerSwipe;

  const { direction, stop } = swipeFn(target, {
    threshold: 10,
    disableTextSelect: true,
    onSwipe() {
      for (const key in swipeStates.value) {
        if (key !== notificationId) {
          swipeStates.value[key]?.resetFn();
        }
      }

      if (direction.value === 'left') {
        const maxSwipe = 75;
        swipeStates.value[notificationId] = {
          left: `-${maxSwipe}px`,
          opacity: 1,
          deleteOpacity: 1,
          isSwiping: true,
          resetFn() {
            this.left = '0';
            this.opacity = 1;
            this.deleteOpacity = 0;
          },
          stopFn: () => {
            delete swipeStates.value[notificationId];
            stop();
            stopOnClickOutside();
            clearTimeout(swipeTimeoutId);
          },
        };
      } else {
        swipeStates.value[notificationId]?.resetFn();
      }
    },
    onSwipeEnd() {
      clearTimeout(swipeTimeoutId);
      swipeTimeoutId = setTimeout(() => {
        if (swipeStates.value[notificationId]) {
          swipeStates.value[notificationId].isSwiping = false;
        }
      }, 10);
    },
  });
}

function toggleMenu(event: any) {
  notificationsMenuRef.value?.toggle(event);
}

function markAllSeen() {
  notificationsSocket.markAllSeen();
}

function markSeen(notification: StoredNotification) {
  notificationsSocket.markSeen(notification);
}

function goToSettings() {
  notificationsMenuRef.value?.hide();
  router.push({ path: '/settings/notifications' });
}

function formatTimestamp(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (minutes < 60) return `${minutes}${t('components.notification_menu.short_minutes')}`;
  if (hours < 24) return `${hours}${t('components.notification_menu.short_hours')}`;
  if (days < 7) return `${days}${t('components.notification_menu.short_days')}`;
  if (days < 30) return `${Math.floor(days / 7)}${t('components.notification_menu.short_weeks')}`;
  if (days < 365) return `${Math.floor(days / 30)}${t('components.notification_menu.short_months')}`;
  return `${Math.floor(days / 365)}${t('components.notification_menu.short_years')}`;
}

function handleNotificationClick(notification: StoredNotification) {
  const link = notification.deepLink;
  notificationsMenuRef.value?.hide();
  removeNotification(notification);
  if (link) {
    router.push(link);
  }
}

function removeNotification(notification?: StoredNotification) {
  if (notification) {
    const swipeState = swipeStates.value[notification.id];
    swipeState?.stopFn();
    notificationsSocket.removeNotification(notification);
  }
}

function clearNotifications(): void {
  for (const key in swipeStates.value) {
    swipeStates.value[key]?.stopFn();
  }
  notificationsSocket.clearNotifications();
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

function openDialog(notification: StoredNotification) {
  const swipeState = swipeStates.value[notification.id];
  if (swipeState?.isSwiping) {
    return;
  }

  const detail = [notification.subtitle, notification.body].filter(Boolean).join('\n');
  dialog.openTextDialog({
    data: {
      title: notification.title,
      contentText: detail,
      confirmText: !notification?.deepLink ? t('components.form.button.mark_as_read') : t('components.form.button.go_to_message'),
    },
    onConfirm: () => handleNotificationClick(notification),
    onCancel: () => removeNotification(notification),
  });
}

function onHide() {
  for (const key in swipeStates.value) {
    swipeStates.value[key]?.resetFn();
    swipeStates.value[key]?.stopFn();
  }
}

function buildElectronUpdateNotification(): StoredNotification {
  return {
    id: 'electron-update',
    title: 'Update',
    body: 'New camera.ui app update available',
    severity: Severity.Info,
    deepLink: '/settings/system',
    tag: 'electron-update',
    createdAt: Date.now(),
    seenAt: null,
    source: { kind: 'system', id: 'system.electron.update_available' },
  };
}

function onAppStatus(_event: IpcRendererEvent, data: any) {
  if (!isElectronApp) {
    return;
  }

  if (data.channel === 'update-check' && data.status === 'available') {
    notificationsSocket.addLocalNotification(buildElectronUpdateNotification());
  }
}

async function initElectronUpdater() {
  if (!isElectronApp) {
    return;
  }

  electron!.removeListener('app-status', onAppStatus);
  electron!.on('app-status', onAppStatus);

  electron!.send('check-for-updates');

  try {
    const response: { isUpdateAvailable: boolean; version?: string } = await electron!.invoke('get-update-available');
    if (response.isUpdateAvailable) {
      notificationsSocket.addLocalNotification(buildElectronUpdateNotification());
    }
  } catch {
    //
  }
}

watch(
  notificationsEnabled,
  (enabled) => {
    if (enabled) {
      notificationsSocket.connect();
    } else {
      resetNotificationsSocket();
    }
  },
  { immediate: true },
);

onMounted(() => {
  if (isElectronApp) {
    initElectronUpdater();
  }
});

onUnmounted(() => {
  electron?.removeListener('app-status', onAppStatus);
});
</script>

<style>
.notification-menu {
  left: auto !important;
  right: calc(env(safe-area-inset-right, 0px) + 0.5rem) !important;
  top: calc(env(safe-area-inset-top, 0px) + 3.3rem) !important;
}
</style>
