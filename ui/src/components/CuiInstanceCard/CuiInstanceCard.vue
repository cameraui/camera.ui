<template>
  <Card
    class="cui-card transition-shadow h-[176px]"
    :class="{
      'ring-1 ring-primary': instance.active,
      'cursor-pointer hover:shadow-md': instance.status !== 'offline',
      'opacity-60': instance.status === 'offline',
    }"
  >
    <template #content>
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-1.5 min-w-0">
            <Button severity="secondary" text rounded class="cui-icon-sm shrink-0 !ml-[calc(-0.25rem*2)]" @click.stop="emit('toggle-favorite')">
              <template #icon>
                <i-solar:star-bold v-if="instance.favorite" class="w-4 h-4 text-yellow-500" />
                <i-solar:star-bold v-else class="w-4 h-4" />
              </template>
            </Button>
            <h3 class="text-xl font-semibold truncate">{{ instance.name }}</h3>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <Tag v-if="instance.status === 'offline'" severity="danger" :value="$t('views.instances.offline')" class="text-xs" />
            <Tag v-if="instance.active" severity="success" :value="$t('views.instances.active')" />
            <Button severity="secondary" text rounded class="cui-icon-sm" @click.stop="emit('open-menu', $event)">
              <template #icon>
                <div class="relative w-5 h-5">
                  <div
                    class="absolute top-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full transform transition-all duration-100 origin-center bg-current"
                    :class="{ 'w-3.5 h-[2px] rotate-45 top-1/2 -translate-y-1/2 rounded-none': menuOpen }"
                  />
                  <div
                    class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-1 rounded-full transition-all duration-100 bg-current"
                    :class="{ 'opacity-0 scale-0': menuOpen }"
                  />
                  <div
                    class="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full transform transition-all duration-100 origin-center bg-current"
                    :class="{ 'w-3.5 h-[2px] -rotate-45 bottom-1/2 translate-y-1/2 rounded-none': menuOpen }"
                  />
                </div>
              </template>
            </Button>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <div
            class="w-2 h-2 rounded-full shrink-0"
            :class="{
              'bg-green-500': instance.status === 'online',
              'bg-red-500': instance.status === 'offline',
              'bg-gray-400': instance.status === 'unknown',
            }"
          />
          <span class="text-sm text-muted-color truncate">
            {{ instance.version ? `v${instance.version}` : instance.url || '' }}
          </span>
          <span v-if="statusTimestamp" class="text-xs text-muted-color ml-auto shrink-0">
            {{ statusTimestamp }}
          </span>
        </div>

        <div v-if="instance.resources" class="flex flex-col gap-2 mt-2">
          <div class="cui-progress-track w-full h-2 rounded-full overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-300"
              :class="barColor(instance.resources.cpuUsage)"
              :style="{ width: `${instance.resources.cpuUsage}%` }"
            />
          </div>
          <div class="flex items-center justify-between text-sm text-muted-color">
            <span>CPU {{ instance.resources.cpuUsage }}%</span>
            <span>{{ formatMem(instance.resources.memUsed) }} / {{ formatMem(instance.resources.memTotal) }}</span>
          </div>
        </div>

        <div v-else-if="!instance.hasCredentials" class="mt-1">
          <span class="text-sm text-orange-500">{{ $t('views.instances.credentials_required') }}</span>
        </div>

        <div v-else class="mt-1">
          <span class="text-sm text-muted-color">
            {{ instance.status === 'offline' ? $t('views.instances.server_offline') : $t('views.instances.no_data') }}
          </span>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex items-center text-muted-color">
        <div v-if="instance.cameras" class="flex items-center gap-4">
          <div class="flex items-center gap-1.5">
            <i-bx:cctv class="w-4 h-4" />
            <span class="text-sm text-color font-medium">{{ instance.cameras.online }}/{{ instance.cameras.total }}</span>
          </div>
          <div class="flex items-center gap-1.5">
            <i-mdi:record-circle-outline class="w-4 h-4 text-red-500" />
            <span class="text-sm text-color font-medium">{{ instance.cameras.recording }}</span>
          </div>
        </div>
        <div v-if="instance.resources" class="flex items-center gap-1.5 ml-auto">
          <i-mdi:harddisk class="w-4 h-4" />
          <span class="text-sm text-color font-medium">{{ formatDisk(instance.resources.diskUsed) }} / {{ formatDisk(instance.resources.diskTotal) }}</span>
        </div>
      </div>
    </template>
  </Card>
</template>

<script setup lang="ts">
import type { CuiInstanceCardEmits, CuiInstanceCardProps } from './types.js';

const props = defineProps<CuiInstanceCardProps>();
const emit = defineEmits<CuiInstanceCardEmits>();

const { instance } = toRefs(props);

const statusTimestamp = computed(() => {
  if (instance.value.lastUpdatedAt) {
    return timeAgo(instance.value.lastUpdatedAt);
  }
  return '';
});

function formatMem(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}

function formatDisk(mb: number): string {
  if (mb >= 1_000_000) return `${(mb / 1_000_000).toFixed(1)} TB`;
  if (mb >= 1000) return `${(mb / 1000).toFixed(0)} GB`;
  return `${mb} MB`;
}

function barColor(usage: number): string {
  if (usage >= 90) return 'bg-red-500';
  if (usage >= 70) return 'bg-orange-400';
  if (usage >= 50) return 'bg-yellow-400';
  return 'bg-green-500';
}

function timeAgo(value: string | number): string {
  const diff = Date.now() - (typeof value === 'number' ? value : new Date(value).getTime());
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return '< 1m';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}
</script>
