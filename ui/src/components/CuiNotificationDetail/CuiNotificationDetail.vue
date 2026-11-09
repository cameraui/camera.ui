<template>
  <div class="flex flex-col">
    <div class="flex items-start gap-3 px-4 pt-4 pb-3">
      <div class="flex items-center justify-center w-10 h-10 rounded-lg shrink-0" :class="tileClass(notification)">
        <component :is="source.icon" class="w-5 h-5" />
      </div>
      <div class="flex-1 min-w-0" :class="{ 'self-center': !showTitle }">
        <h2 v-if="showTitle" class="text-base font-semibold text-color break-words">{{ notification.title }}</h2>
        <p class="text-xs text-muted" :class="{ 'mt-0.5': showTitle }">
          <template v-if="!showTitle || showsSource(notification)">{{ source.label }} · </template>
          <template v-if="severityLabel(notification)">
            <span :class="severityTextClass(notification)">{{ severityLabel(notification) }}</span> ·
          </template>
          {{ formatDateTime(notification.createdAt) }}
        </p>
      </div>
      <Button v-if="closable" text rounded severity="secondary" class="cui-icon-md shrink-0 -mt-1 -mr-1" @click="emit('close')">
        <template #icon>
          <i-mdi:close width="100%" height="100%" />
        </template>
      </Button>
    </div>

    <div v-if="image" class="px-4 pb-4">
      <div class="relative w-full aspect-video rounded-lg overflow-hidden bg-black">
        <video v-if="video" :key="notification.id" :src="video" :poster="image" class="w-full h-full object-contain" controls autoplay muted playsinline />
        <CuiImage v-else :src="image" alt="" :image-style="{ objectFit: 'contain' }" image-container-class="w-full h-full" image-class="w-full h-full" />
      </div>
    </div>

    <div class="flex flex-col gap-4 px-4 pb-4">
      <div v-if="!notification.log && (notification.subtitle || notification.body)" class="flex flex-col gap-1">
        <p v-if="notification.subtitle" class="text-sm font-medium text-color">{{ notification.subtitle }}</p>
        <p v-if="notification.body" class="text-sm text-muted whitespace-pre-line">{{ notification.body }}</p>
      </div>

      <div v-if="notification.log">
        <span class="section-title mb-1">{{ $t('views.notifications.messages') }}</span>
        <ul class="flex flex-col divide-y divide-(--border-color)">
          <li v-for="message in notification.log.messages.slice(0, 5)" :key="message.text" class="flex flex-col gap-1 py-2.5">
            <code class="font-mono text-xs text-color break-words">{{ message.text }}</code>
            <span class="text-xs text-muted">{{ occurrenceLabel(message.count, message.lastAt) }}</span>
          </li>
        </ul>
      </div>

      <div class="flex flex-wrap gap-2">
        <Button v-if="logLink" class="cui-button-medium" :label="$t('views.notifications.open_log')" @click="go(logLink)" />
        <template v-else>
          <Button
            v-if="openLink"
            class="cui-button-medium"
            :label="isRecordingLink ? $t('views.notifications.recording') : $t('views.notifications.open')"
            @click="go(openLink)"
          />
          <Button v-if="liveLink" severity="secondary" outlined class="cui-button-medium" :label="$t('views.notifications.live_view')" @click="go(liveLink)" />
        </template>
        <Button
          v-if="assistantReady"
          v-tooltip.top="{ value: $t('views.notifications.ask_assistant') }"
          severity="secondary"
          outlined
          class="cui-button-medium"
          @click="go({ path: '/assistant', query: { prompt: assistantPrompt() } })"
        >
          <template #icon>
            <i-tabler:sparkles class="w-4.5 h-4.5" />
          </template>
        </Button>

        <div class="flex gap-2 ml-auto">
          <Button
            v-tooltip.top="{ value: notification.seenAt == null ? $t('components.notification_menu.mark_read') : $t('views.notifications.mark_unread') }"
            severity="secondary"
            outlined
            class="cui-button-medium"
            @click="emit('toggleSeen', notification)"
          >
            <template #icon>
              <i-mdi:email-outline v-if="notification.seenAt == null" class="w-4.5 h-4.5" />
              <i-mdi:email-open-outline v-else class="w-4.5 h-4.5" />
            </template>
          </Button>
          <Button
            v-tooltip.top="{ value: $t('components.notification_menu.delete') }"
            severity="danger"
            outlined
            class="cui-button-medium"
            @click="emit('remove', notification)"
          >
            <template #icon>
              <i-mdi:delete-outline class="w-4.5 h-4.5" />
            </template>
          </Button>
        </div>
      </div>
    </div>

    <div class="p-4 border-t border-color">
      <span class="section-title mb-1">{{ $t('views.notifications.details') }}</span>
      <dl class="flex flex-col divide-y divide-(--border-color) text-sm">
        <div v-for="row in detailRows" :key="row.label" class="flex items-center justify-between gap-4 py-2.5">
          <dt class="text-muted shrink-0">{{ row.label }}</dt>
          <dd class="text-color text-right truncate">{{ row.value }}</dd>
        </div>
      </dl>
    </div>

    <div v-if="centerLink" class="flex justify-center px-4 pb-4">
      <Button
        text
        class="cui-button-small"
        :label="$t('components.notification_menu.show_in_center')"
        @click="go(`/notifications?id=${encodeURIComponent(notification.id)}`)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { notificationCameraId, notificationPluginId } from '@shared/types';

import { AssistantQuery } from '@/api/routes/assistant.js';

import { CUI_NOTIFICATION_DETAIL_DEFAULTS } from './types.js';

import type { CuiNotificationDetailEmits, CuiNotificationDetailProps } from './types.js';
import type { RouteLocationRaw } from 'vue-router';

const assistantQuery = new AssistantQuery();

const props = withDefaults(defineProps<CuiNotificationDetailProps>(), CUI_NOTIFICATION_DETAIL_DEFAULTS);

const emit = defineEmits<CuiNotificationDetailEmits>();

const router = useRouter();
const { t } = useI18n();
const { sourceOf, cameraNameOf, imageOf, videoOf, severityLabel, severityTextClass, tileClass, occurrenceLabel, showsSource, formatDateTime } = useNotificationDisplay();

const { data: assistantStatus } = assistantQuery.getAssistantStatusQuery();

const source = computed(() => sourceOf(props.notification));
const image = computed(() => imageOf(props.notification));
const video = computed(() => videoOf(props.notification));
const cameraName = computed(() => cameraNameOf(props.notification));
const isRecordingLink = computed(() => !!props.notification.deepLink?.includes('startTs='));
const assistantReady = computed(() => assistantStatus.value?.state === 'ready');

const logLink = computed(() => {
  const { log, cameraName: currentCamera, sourceName } = props.notification;
  if (!log) return undefined;

  const cameraId = notificationCameraId(props.notification);
  const target = cameraId ? currentCamera && `camera:${cameraId}` : sourceName && `plugin:${notificationPluginId(props.notification)}`;
  return target ? `/logs?source=${encodeURIComponent(target)}&at=${log.lastAt}` : undefined;
});

const openLink = computed(() => {
  const { deepLink, sourceName } = props.notification;
  if (!deepLink) return undefined;
  // a recording link needs the plugin that recorded it
  return isRecordingLink.value && !sourceName ? undefined : deepLink;
});

const liveLink = computed(() => {
  const camera = props.notification.cameraName;
  return camera ? `/cameras/${encodeURIComponent(camera)}` : undefined;
});

const detailRows = computed(() => {
  const item = props.notification;
  const rows = [
    ...(cameraName.value ? [{ label: t('views.notifications.camera'), value: cameraName.value }] : []),
    { label: t('views.notifications.source'), value: source.value.label },
  ];
  if (!item.log) return [...rows, { label: t('views.notifications.received'), value: formatDateTime(item.createdAt) }];

  return [
    ...rows,
    { label: t('views.notifications.first_seen'), value: formatDateTime(item.createdAt) },
    { label: t('views.notifications.last_seen'), value: formatDateTime(item.log.lastAt) },
    { label: t('views.notifications.occurrences'), value: String(item.log.count) },
  ];
});

function assistantPrompt(): string {
  const item = props.notification;
  const label = source.value.label;
  if (item.log) {
    const { count, lastAt, messages } = item.log;
    const values = { source: label, camera: cameraName.value, count, first: formatDateTime(item.createdAt), last: formatDateTime(lastAt), message: messages[0].text };
    return t(cameraName.value ? 'views.notifications.ask_assistant_log_camera' : 'views.notifications.ask_assistant_log', values, count);
  }

  const text = [item.title, item.subtitle, item.body].filter(Boolean).join(': ');
  return t('views.notifications.ask_assistant_entry', { source: label, time: formatDateTime(item.createdAt), text });
}

function go(target: RouteLocationRaw) {
  emit('navigate');
  router.push(target);
}
</script>
