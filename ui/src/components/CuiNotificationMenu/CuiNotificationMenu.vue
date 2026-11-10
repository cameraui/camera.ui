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
      :dismissable="!detailOpen"
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
            <Badge v-if="unreadCount" class="rounded-full text-xs p-1" :value="unreadCount > 99 ? '99+' : String(unreadCount)" />
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
          <CuiNotificationItem
            v-for="notification in notifications"
            :key="notification.id"
            :notification
            :time="formatTimestamp(notification.createdAt)"
            @open="openDialog"
            @mark-seen="markSeen"
            @remove="removeNotification"
          />
        </div>

        <div v-if="notifications.length === 0" class="text-center py-8 text-muted text-sm">
          {{ $t('components.notification_menu.no_notifications') }}
        </div>

        <Button severity="secondary" text class="cui-button w-full justify-center text-sm mt-1" :label="$t('components.notification_menu.show_all')" @click="goToAll" />
      </template>
    </Popover>

    <CuiBottomSheet v-model="sheetOpen">
      <div class="-mx-4">
        <CuiNotificationDetail
          v-if="sheetNotification"
          :notification="sheetNotification"
          center-link
          @navigate="closeAll"
          @toggle-seen="toggleSeen"
          @remove="removeFromDetail"
        />
      </div>
    </CuiBottomSheet>
  </div>
</template>

<script setup lang="ts">
import { Severity } from '@camera.ui/sdk';

import { NotificationsQuery } from '@/api/routes/notifications.js';
import CuiNotificationDetail from '@/components/CuiNotificationDetail/CuiNotificationDetail.vue';
import CuiNotificationItem from './CuiNotificationItem.vue';
import { NotificationSwipeKey } from './types.js';

import type { CuiNotificationDetailProps } from '@/components/CuiNotificationDetail/types.js';
import type { IpcRendererEvent } from '@/types/electron';
import type { StoredNotification } from '@shared/types';
import type { Popover } from 'openvue';
import type { DynamicDialogInstance } from 'openvue/dynamicdialogoptions';
import type { NotificationDetailEvents } from './types.js';

const router = useRouter();
const dialog = useCuiDialog();
const { t } = useI18n();
const { isElectronApp, electron } = useElectron();
const { mdBreakpoint } = useSharedCuiBreakpoint();

const notificationsQuery = new NotificationsQuery();

const notificationsSocket = useNotificationsSocket();

const { data: settings, isLoading: settingsLoading } = notificationsQuery.getSettingsQuery();

const notificationsMenuRef = useTemplateRef<InstanceType<typeof Popover>>('notificationsMenuRef');
const swipedId = ref<string>();
const sheetOpen = ref(false);
const sheetNotification = ref<StoredNotification>();
const detailDialog = shallowRef<DynamicDialogInstance>();

const notifications = computed(() => notificationsSocket.notifications.value);
const unreadCount = computed(() => notificationsSocket.unreadCount.value);
const notificationsEnabled = computed(() => settings.value?.enabled ?? false);
const settingsResolved = computed(() => !settingsLoading.value || settings.value !== undefined);
const detailOpen = computed(() => sheetOpen.value || !!detailDialog.value);

provide(NotificationSwipeKey, swipedId);

function toggleMenu(event: any) {
  notificationsMenuRef.value?.toggle(event);
}

function markAllSeen() {
  notificationsSocket.markAllSeen();
}

function markSeen(notification: StoredNotification) {
  notificationsSocket.markSeen(notification);
}

function goToAll() {
  notificationsMenuRef.value?.hide();
  router.push({ path: '/notifications' });
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

function removeNotification(notification: StoredNotification) {
  notificationsSocket.removeNotification(notification);
}

function clearNotifications(): void {
  notificationsSocket.clearNotifications();
}

function toggleSeen(notification: StoredNotification) {
  if (notification.seenAt == null) notificationsSocket.markSeen(notification);
  else notificationsSocket.markUnseen(notification);
}

function removeFromDetail(notification: StoredNotification) {
  removeNotification(notification);
  sheetOpen.value = false;
  detailDialog.value?.close();
}

function closeAll() {
  sheetOpen.value = false;
  detailDialog.value?.close();
  notificationsMenuRef.value?.hide();
}

function openDialog(notification: StoredNotification) {
  notificationsSocket.markSeen(notification);

  if (notificationsSocket.isLocal(notification)) {
    notificationsMenuRef.value?.hide();
    if (notification.deepLink) router.push(notification.deepLink);
    return;
  }

  if (mdBreakpoint.value) {
    sheetNotification.value = notification;
    sheetOpen.value = true;
    return;
  }

  detailDialog.value = dialog.openComponentDialog<CuiNotificationDetailProps, NotificationDetailEvents>(CuiNotificationDetail, {
    data: {
      title: notification.title,
      hideCancelButton: true,
      hideConfirmButton: true,
      dialogContentClass: 'px-0!',
      contentProps: { notification, showTitle: false, centerLink: true },
    },
    dialogSize: {
      desktop: { width: '480px', maxWidth: '90vw', maxHeight: '90vh' },
    },
    events: {
      navigate: closeAll,
      toggleSeen,
      remove: removeFromDetail,
    },
    onSettled: () => (detailDialog.value = undefined),
  });
}

function onHide() {
  swipedId.value = undefined;
}

function buildElectronUpdateNotification(): StoredNotification {
  return {
    id: 'electron-update',
    title: 'Update',
    body: 'New camera.ui app update available',
    severity: Severity.Info,
    deepLink: '/updates',
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
  } catch {}
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
  right: calc(var(--safe-area-inset-right) + 0.5rem) !important;
  top: calc(var(--safe-area-inset-top) + 3.3rem) !important;
}
</style>
