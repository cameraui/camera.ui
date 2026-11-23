<template>
  <div v-if="mutedUntil" class="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-500/10">
    <i-mdi:bell-off-outline class="w-4 h-4 text-primary shrink-0" />
    <span class="flex-1 min-w-0 text-xs text-color">{{ $t('components.notification_mute.muted_until', { time: formatMuteEnd(mutedUntil) }) }}</span>
    <Button text size="small" class="cui-button-small shrink-0" :label="$t('components.notification_mute.unmute')" @click="unmute()" />
  </div>
</template>

<script setup lang="ts">
const { mutedUntil, formatMuteEnd, unmute } = useNotificationMute();
</script>
