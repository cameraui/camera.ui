import { pairInit, pairPoll } from '@/api/routes/remote.js';
import { i18n } from '@/i18n/index.js';

import type { QueryClient } from '@tanstack/vue-query';

const code = ref<string | null>(null);
const url = ref('');
const countdown = ref('');
const starting = ref(false);
let attempt = 0;
let expiresAt = 0;
let pollIntervalSec = 2;
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let countdownTimer: ReturnType<typeof setInterval> | null = null;
let name: string | undefined;
let onConfirmed: (() => void) | undefined;
let queryClient: QueryClient | undefined;

function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function clearTimers() {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
}

function reset() {
  attempt++;
  clearTimers();
  code.value = null;
  url.value = '';
  countdown.value = '';
  expiresAt = 0;
  onConfirmed = undefined;
}

function expire() {
  reset();
  useCuiToast().add({ severity: 'warn', detail: i18n.global.t('components.toast.pair_expired'), life: 3000 });
}

function startCountdown() {
  const update = () => {
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      expire();
      return;
    }
    countdown.value = formatCountdown(remaining);
  };
  update();
  countdownTimer = setInterval(update, 1000);
}

function schedulePoll() {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = setTimeout(runPoll, pollIntervalSec * 1000);
}

async function confirm() {
  const done = onConfirmed;
  reset();
  await queryClient?.refetchQueries({ queryKey: ['remote'], exact: true });
  await queryClient?.refetchQueries({ queryKey: ['remote', 'status'], exact: true });
  useCuiToast().add({ severity: 'success', detail: i18n.global.t('components.toast.remote_registered'), life: 3000 });
  done?.();
}

async function runPoll() {
  const current = attempt;
  try {
    const result = await pairPoll({ name });
    if (attempt !== current) return;
    switch (result.state) {
      case 'confirmed':
        await confirm();
        return;
      case 'expired':
        expire();
        return;
      case 'denied':
        reset();
        useCuiToast().add({ severity: 'warn', detail: i18n.global.t('components.toast.pair_denied'), life: 3000 });
        return;
      case 'slow_down':
        pollIntervalSec = Math.min(pollIntervalSec + 2, 10);
    }
    schedulePoll();
  } catch (err) {
    if (attempt !== current) return;
    // keep polling, the cloud side's TTL decides the expiry
    useLogger('ServerPairing').error('pair poll failed:', err);
    schedulePoll();
  }
}

export function useServerPairing() {
  queryClient ??= useQueryClient();

  const isPairing = computed(() => code.value !== null);

  async function start(serverName?: string, confirmed?: () => void): Promise<void> {
    reset();
    const current = attempt;
    starting.value = true;
    try {
      const result = await pairInit(serverName);
      if (attempt !== current) return;
      name = serverName;
      onConfirmed = confirmed;
      code.value = result.userCode;
      url.value = result.verificationUriComplete;
      expiresAt = Date.now() + result.expiresIn * 1000;
      pollIntervalSec = Math.max(1, result.pollInterval);
      startCountdown();
      schedulePoll();
    } finally {
      starting.value = false;
    }
  }

  return { code, url, countdown, starting, isPairing, start, cancel: reset };
}
