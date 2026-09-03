<template>
  <Transition name="fade">
    <div v-if="visible || notice" class="cui-connection-indicator shadow-xl" :style="{ bottom: bottomOffset }">
      <div class="cui-connection-indicator__content">
        <ProgressSpinner v-if="visible" class="!w-5 !h-5 shrink-0" stroke-width="5" />
        <component :is="noticeIcon" v-else class="w-5 h-5 shrink-0" :class="noticeIconColor" />

        <span class="cui-connection-indicator__text">
          {{ visible ? statusText : noticeText }}
        </span>

        <Button v-if="visible && showEscape" size="small" rounded class="cui-connection-indicator__button" :aria-label="t('connection.pick_server')" @click="onEscape">
          <i-mdi:cloud-outline class="w-4 h-4" />
        </Button>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import EarthIcon from '~icons/mdi/earth';
import LanIcon from '~icons/mdi/lan';

import { isLanTarget, useBootMode } from '@/connection/index.js';

const NOTICE_MS = 3_000;

const { t } = useI18n();
const { bottombarHeight } = useSharedCuiStates();
const connection = useConnection();
const { bannerMode, inTrouble, isOnline, target } = connection;
const { restarting } = useServerRestart();
const mode = useBootMode();

const authStore = useAuthStore();
const { isLoggedIn } = storeToRefs(authStore);

const notice = ref<'lan' | 'wan' | null>(null);
const announcedKind = ref<'lan' | 'wan' | null>(null);
let noticeTimer: ReturnType<typeof setTimeout> | undefined;

const bottomOffset = computed(() => `calc(${bottombarHeight.value}px + 1rem + var(--safe-area-inset-bottom))`);

const visible = computed(() => isLoggedIn.value && (bannerMode.value !== null || restarting.value));

const statusText = computed(() => {
  if (bannerMode.value === 'connecting') return t('connection.connecting_remote');
  if (bannerMode.value === 'degraded') return t('connection.degraded');
  if (bannerMode.value !== null) return t('connection.reconnecting');
  return t('connection.restarting');
});

const connectionKind = computed<'lan' | 'wan' | null>(() => {
  if (!isLoggedIn.value || !isOnline.value) return null;
  const endpoint = target.value?.endpoint;
  if (!endpoint) return null;
  return isLanTarget(endpoint, mode) ? 'lan' : 'wan';
});

const noticeText = computed(() => (notice.value === 'lan' ? t('connection.connected_lan') : t('connection.connected_wan')));

const noticeIcon = computed(() => (notice.value === 'lan' ? LanIcon : EarthIcon));

const noticeIconColor = computed(() => (notice.value === 'lan' ? 'text-success' : 'text-info'));

const showEscape = computed(() => inTrouble.value && mode === 'cloud');

function clearNotice() {
  if (noticeTimer !== undefined) {
    clearTimeout(noticeTimer);
    noticeTimer = undefined;
  }
  notice.value = null;
}

async function onEscape() {
  const { bounceToCloudFrontend } = await import('@/connection/cloudHandoff');
  await bounceToCloudFrontend();
}

watch(connectionKind, (kind) => {
  if (!kind || kind === announcedKind.value) return;
  announcedKind.value = kind;
  clearNotice();
  notice.value = kind;
  noticeTimer = setTimeout(clearNotice, NOTICE_MS);
});

watch(visible, (troubled) => {
  if (troubled) clearNotice();
});

watch(isLoggedIn, (loggedIn) => {
  if (!loggedIn) {
    clearNotice();
    announcedKind.value = null;
  }
});

onUnmounted(() => {
  clearNotice();
});
</script>

<style scoped>
.cui-connection-indicator {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  background: var(--card-background);
  border: 1px solid var(--border-color);
  max-width: calc(100vw - 2rem);
}

.cui-connection-indicator__content {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.cui-connection-indicator__text {
  font-size: 0.875rem;
  color: var(--text-color);
  white-space: nowrap;
}

.cui-connection-indicator__button {
  margin-left: 0.5rem;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
