<template>
  <Transition name="fade">
    <div v-if="visible" class="cui-updates-indicator shadow-xl" :class="{ 'cursor-pointer': isAdmin }" :style="{ bottom: bottomOffset }" @click="goToUpdates">
      <div class="cui-updates-indicator__content">
        <ProgressSpinner v-if="!finishedText" class="!w-5 !h-5 shrink-0" stroke-width="5" />
        <i-mdi:alert-circle v-else-if="failedCount > 0" class="w-5 h-5 shrink-0 text-red-500" />
        <i-mdi:check-circle v-else class="w-5 h-5 shrink-0 text-success" />

        <span class="cui-updates-indicator__text">
          {{ text }}
        </span>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
const FINISHED_NOTICE_MS = 4_000;

const router = useRouter();
const { t } = useI18n();
const { bottombarHeight } = useSharedCuiStates();
const updatesSocket = useUpdatesSocket();

const authStore = useAuthStore();
const { isLoggedIn, user } = storeToRefs(authStore);

const finishedText = ref(false);
let finishedTimer: ReturnType<typeof setTimeout> | undefined;

const isAdmin = computed(() => user.value?.role === 'admin' || user.value?.role === 'master');

const payload = updatesSocket.status;

const updatingItems = computed(() => payload.value?.items.filter((item) => item.status === 'updating') ?? []);
const restarting = computed(() => payload.value?.items.some((item) => item.status === 'restarting') === true);
const failedCount = computed(() => payload.value?.items.filter((item) => item.status === 'error').length ?? 0);
const updating = computed(() => payload.value?.updating === true);
const runActive = computed(() => payload.value?.runActive === true);
const runDone = computed(() => payload.value?.items.filter((item) => item.status === 'success' || item.status === 'error').length ?? 0);
const runTotal = computed(() => payload.value?.items.length ?? 0);
const visible = computed(() => isLoggedIn.value && !restarting.value && (updating.value || finishedText.value));

const text = computed(() => {
  if (finishedText.value) {
    return failedCount.value > 0 ? t('views.updates.indicator_failed', { count: failedCount.value }) : t('views.updates.indicator_done');
  }
  if (runActive.value && updatingItems.value[0]) {
    return t('views.updates.indicator_running', { name: itemLabel(updatingItems.value[0]), done: runDone.value + 1, total: runTotal.value });
  }
  if (updatingItems.value.length > 1) {
    return t('views.updates.indicator_running_many', { count: updatingItems.value.length });
  }
  if (updatingItems.value[0]) {
    return t('views.updates.run_updating', { name: itemLabel(updatingItems.value[0]) });
  }
  return t('views.updates.indicator_preparing');
});

const bottomOffset = computed(() => `calc(${bottombarHeight.value}px + 1rem + env(safe-area-inset-bottom, 0px))`);

function goToUpdates(): void {
  if (isAdmin.value) {
    router.push('/updates');
  }
}

function clearFinished(): void {
  if (finishedTimer !== undefined) {
    clearTimeout(finishedTimer);
    finishedTimer = undefined;
  }
  finishedText.value = false;
}

function itemLabel(item: { name: string; displayName?: string }): string {
  return item.displayName || item.name;
}

watch(
  isLoggedIn,
  (loggedIn) => {
    if (loggedIn) {
      updatesSocket.connect();
    } else {
      clearFinished();
    }
  },
  { immediate: true },
);

watch(updating, (now, was) => {
  if (was && !now) {
    finishedText.value = true;
    clearTimeout(finishedTimer);
    finishedTimer = setTimeout(clearFinished, FINISHED_NOTICE_MS);
  } else if (now) {
    clearFinished();
  }
});

onUnmounted(() => {
  clearTimeout(finishedTimer);
});
</script>

<style scoped>
.cui-updates-indicator {
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

.cui-updates-indicator__content {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.cui-updates-indicator__text {
  font-size: 0.875rem;
  color: var(--text-color);
  white-space: nowrap;
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
