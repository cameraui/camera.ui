<template>
  <CuiScreen brand center :back="canGoBack || showCloudButton" :subtitle="serverName" @back="onBack">
    <Transition name="fade-switch" mode="out-in">
      <div v-if="showConnecting" key="connecting" class="flex flex-col items-center gap-4 pb-12">
        <ProgressSpinner stroke-width="4" class="w-12! h-12!" />
        <p class="text-muted text-sm text-center">{{ connectingText }}</p>
        <Button v-if="inTrouble" size="small" severity="secondary" :label="$t('connection.retry')" @click="onRetry" />
      </div>

      <Form v-else-if="!requires2FA" id="login-form" key="login" ref="formRef" :validation-schema="authValidationSchema" class="flex flex-col gap-6" @submit="onLogin">
        <Message v-if="movedAway" severity="warn" size="small">{{ $t('restore.moved_away') }}</Message>
        <Message v-if="restoreNotice" :severity="restoreNoticeSeverity" size="small">
          <div class="flex flex-col gap-1">
            <span>{{ restoreNoticeText }}</span>
            <span v-if="restoreAccounts" class="font-semibold select-text">{{ restoreAccounts }}</span>
          </div>
        </Message>

        <Field v-slot="{ field, errors }" v-model.trim="username" name="username" as="div" class="flex flex-col field-gap" :validate-on-blur="false">
          <label for="username" class="cui-label">{{ $t('components.form.label.username') }}</label>
          <InputGroup>
            <InputText :invalid="errors.length > 0" type="text" size="large" :loading="loginLoading" v-bind="field" />
          </InputGroup>
          <Transition name="fade">
            <ErrorMessage name="username" class="cui-input-error" />
          </Transition>
        </Field>

        <Field v-slot="{ field, errors }" v-model="password" name="password" as="div" class="flex flex-col field-gap" :validate-on-blur="false">
          <label for="password" class="cui-label">{{ $t('components.form.label.password') }}</label>
          <InputGroup>
            <Password :invalid="errors.length > 0" size="large" :loading="loginLoading" :feedback="false" toggle-mask v-bind="field" />
          </InputGroup>
          <Transition name="fade">
            <ErrorMessage name="password" class="cui-input-error" />
          </Transition>
        </Field>

        <Field
          v-if="!isCapacitor"
          v-slot="{ field, errors }"
          :model-value="rememberMe"
          name="rememberMe"
          type="checkbox"
          :checked-value="true"
          :unchecked-value="false"
          as="div"
          class="flex flex-col field-gap"
        >
          <div class="flex items-center field-checkbox-gap">
            <Checkbox
              :model-value="rememberMe"
              v-bind="field"
              :invalid="errors.length > 0"
              class="mr-2"
              binary
              :loading="loginLoading"
              @value-change="rememberMe = $event"
            />
            <label for="rememberMe" class="cui-label-checkbox">{{ $t('components.form.label.remember_me') }}</label>
          </div>
          <Transition name="fade">
            <ErrorMessage name="rememberMe" class="cui-input-checkbox-error" />
          </Transition>
        </Field>
      </Form>

      <div v-else key="2fa" v-focustrap class="flex flex-col items-center text-center gap-6">
        <div class="flex flex-col items-center">
          <h2 class="text-lg font-semibold mb-2">{{ $t('views.login.2fa_title') }}</h2>
          <p class="text-muted text-sm">{{ useBackupCode ? $t('views.login.2fa_backup_description') : $t('views.login.2fa_description') }}</p>
        </div>

        <div class="flex flex-col items-center">
          <InputOtp v-if="!useBackupCode" v-model="otpCode" :length="OTP_LENGTH" integer-only size="large" />
          <InputText
            v-else
            v-model="backupCode"
            size="large"
            autocapitalize="characters"
            autocomplete="off"
            spellcheck="false"
            :maxlength="BACKUP_CODE_LENGTH"
            :placeholder="$t('views.login.2fa_backup_placeholder')"
            class="text-center font-mono tracking-[0.3em] uppercase"
            @keyup.enter="onVerify2FA"
          />
          <Button
            severity="secondary"
            text
            size="small"
            class="mt-4 text-xs"
            :label="useBackupCode ? $t('views.login.2fa_use_app') : $t('views.login.2fa_backup_hint')"
            @click="onToggle2FAMode"
          />
        </div>
      </div>
    </Transition>

    <template v-if="!showConnecting" #footer>
      <template v-if="!requires2FA">
        <Button
          type="submit"
          form="login-form"
          class="text-white font-semibold cui-button-large"
          :loading="loginLoading"
          :label="$t('components.form.button.login')"
          fluid
        />

        <Button
          v-if="biometricButtonVisible"
          type="button"
          severity="secondary"
          class="cui-button-large"
          text
          :loading="biometricLoading"
          :label="$t('components.form.button.biometric_login')"
          fluid
          @click="onBiometricLogin"
        >
          <template #icon>
            <i-mdi:face-recognition class="w-5 h-5 mr-2" />
          </template>
        </Button>
      </template>

      <template v-else>
        <Button
          class="text-white font-semibold cui-button-large"
          :loading="loginLoading"
          :disabled="!canVerify2FA"
          :label="$t('views.login.2fa_verify')"
          fluid
          @click="onVerify2FA"
        />
        <Button severity="secondary" class="cui-button-large" text :label="$t('components.form.button.cancel')" fluid @click="onCancel2FA" />
      </template>
    </template>
  </CuiScreen>
</template>

<script setup lang="ts">
import { ErrorMessage, Field, Form } from 'vee-validate';

import { movedAwayStateFn } from '@/api/routes/backup.js';
import { CLOUD_SERVICE_URL } from '@/common/constants.js';
import { extractErrorMessage } from '@/common/utils.js';
import CuiScreen from '@/components/CuiScreen/CuiScreen.vue';
import { checkBiometryAvailable, clearCredentials, hasStoredCredentials, saveCredentials, unlockCredentials } from '@/composables/useBiometricCredentials.js';
import { getDeviceId, getDeviceName } from '@/composables/useDeviceIdentity.js';
import { redirectOrigin } from '@/connection/authParamHandoff.js';
import { clearCapacitorCloudPreferences, getServerKey, getServerName } from '@/connection/cloudHandoff.js';
import { getDirectServer, useBootMode } from '@/connection/index.js';
import { isCapacitor, showSplashScreen } from '@/connection/runtime.js';
import { authValidationSchema } from '@/schemas/users.schema.js';

import type { RestoreNotice, RestoreStatus } from '@shared/types';

const SAVE_PROMPT_DECLINED_KEY = 'cui.biometric.declined';
const OTP_LENGTH = 6;
const BACKUP_CODE_LENGTH = 8;

const log = useLogger();
const toast = useCuiToast();
const dialog = useCuiDialog();
const { t } = useI18n();
const mode = useBootMode();
const connection = useConnection();
const { isNeedsAuth, isOnline, inTrouble } = connection;
const { loginNotice } = useBackupRestore();

const authStore = useAuthStore();
const { loginLoading, requires2FA } = storeToRefs(authStore);

const instanceStore = useInstanceStore();

const formRef = useTemplateRef<InstanceType<typeof Form>>('formRef');
const username = ref('');
const password = ref('');
const rememberMe = ref(false);
const otpCode = ref('');
const backupCode = ref('');
const useBackupCode = ref(false);
const biometricLoading = ref(false);
const hasCredsForServer = ref(false);
const biometryAvailable = ref(false);
const restoreNotice = ref<(RestoreNotice & Partial<RestoreStatus>) | null>(null);
const movedAway = ref(false);

const canGoBack = computed(() => !instanceStore.isHomeActive || instanceStore.redirectInfo !== null);
const canVerify2FA = computed(() => (useBackupCode.value ? backupCode.value.trim().length === BACKUP_CODE_LENGTH : otpCode.value.length === OTP_LENGTH));
const isDirectServer = getDirectServer() !== null;
const showCloudButton = computed(() => (mode === 'cloud' || isDirectServer) && instanceStore.isHomeActive);
const showConnecting = computed(() => !isOnline.value && !isNeedsAuth.value && !loginLoading.value && !requires2FA.value);
const connectingText = computed(() => {
  if (inTrouble.value) return t('connection.unreachable');
  const name = getServerName();
  return name ? t('connection.connecting_to', { name }) : t('connection.connecting_remote');
});

// a remote instance logs in under its own name, the saved one belongs to the home server
const serverName = computed(() => (instanceStore.isHomeActive ? (getServerName() ?? undefined) : undefined));

const biometricButtonVisible = computed(() => isCapacitor && biometryAvailable.value && hasCredsForServer.value);

const restoreNoticeSeverity = computed(() => {
  switch (restoreNotice.value?.state) {
    case 'done':
      return 'success';
    case 'confirmed':
    case 'applied':
      return 'info';
    default:
      return 'warn';
  }
});

const restoreNoticeText = computed(() => {
  switch (restoreNotice.value?.state) {
    case 'confirmed':
    case 'applied':
      return t('views.login.restore_running');
    case 'done':
    case 'done-with-problems':
      return restoreNotice.value.kind === 'undo' ? t('restore.result_undone') : t('views.login.restore_done');
    case 'failed':
      return t('restore.result_failed');
    default:
      return t('restore.result_rolled_back');
  }
});

const restoreAccounts = computed(() => {
  const notice = restoreNotice.value;
  if (notice?.kind === 'undo' || (notice?.state !== 'done' && notice?.state !== 'done-with-problems')) return '';
  return notice.summary?.accounts.map((account) => account.username).join(', ') ?? '';
});

function onRetry() {
  connection.retry();
}

function goBack() {
  if (instanceStore.redirectInfo) {
    const src = redirectOrigin(instanceStore.redirectInfo.sourceUrl);
    instanceStore.redirectInfo = null;
    if (src) {
      window.location.href = src;
      return;
    }
  }
  instanceStore.switchInstance(null);
}

async function performLogin(creds: { username: string; password: string }): Promise<boolean> {
  try {
    const [deviceId, deviceName] = await Promise.all([getDeviceId(), getDeviceName()]);
    await authStore.login({
      username: creds.username,
      password: creds.password,
      kind: isCapacitor ? 'native' : 'web',
      persistent: isCapacitor ? true : rememberMe.value,
      device: { id: deviceId, name: deviceName },
    });
    return true;
  } catch (error: unknown) {
    toast.add({
      severity: 'error',
      detail: error,
      life: 3000,
    });
    return false;
  }
}

async function onLogin(): Promise<void> {
  const ok = await performLogin({ username: username.value, password: password.value });
  if (!ok) return;
  await maybePromptSaveCredentials({ username: username.value, password: password.value });
}

async function onBiometricLogin(): Promise<void> {
  const serverId = credentialsServerKey();
  if (!serverId) return;
  biometricLoading.value = true;
  try {
    const creds = await unlockCredentials(serverId, t('views.login.biometric_reason'));
    if (!creds) return;
    username.value = creds.username;
    password.value = creds.password;
    const ok = await performLogin(creds);
    if (!ok) {
      // the password changed, drop the stale credentials
      await clearCredentials(serverId);
      hasCredsForServer.value = false;
    }
  } finally {
    biometricLoading.value = false;
  }
}

function credentialsServerKey(): string | null {
  // saved credentials belong to the home server, a remote must not use or replace them
  if (!isCapacitor || !instanceStore.isHomeActive) return null;
  return getServerKey();
}

async function maybePromptSaveCredentials(creds: { username: string; password: string }): Promise<void> {
  if (!isCapacitor) return;
  if (!biometryAvailable.value) return;
  const serverId = credentialsServerKey();
  if (!serverId) return;
  if (hasCredsForServer.value) {
    await saveCredentials(serverId, creds);
    return;
  }
  if (localStorage.getItem(SAVE_PROMPT_DECLINED_KEY + ':' + serverId) === '1') return;

  dialog.openTextDialog({
    data: {
      title: t('views.login.biometric_save_title'),
      contentText: t('views.login.biometric_save_description'),
      confirmText: t('views.login.biometric_save_confirm'),
      cancelText: t('views.login.biometric_save_decline'),
    },
    onConfirm: async () => {
      try {
        await saveCredentials(serverId, creds);
        hasCredsForServer.value = true;
      } catch (err) {
        log.warn('saveCredentials failed:', err);
      }
    },
    onCancel: () => {
      try {
        localStorage.setItem(SAVE_PROMPT_DECLINED_KEY + ':' + serverId, '1');
      } catch {
        // localStorage unavailable, the next login asks again
      }
    },
  });
}

function onBack(): void {
  if (canGoBack.value) {
    goBack();
    return;
  }
  goToCloud();
}

async function goToCloud(): Promise<void> {
  if (isCapacitor) {
    await showSplashScreen();
    // otherwise the next launch skips the server pick
    await clearCapacitorCloudPreferences();
    window.location.replace(`${window.location.origin}/`);
    return;
  }
  window.location.href = CLOUD_SERVICE_URL;
}

function onToggle2FAMode(): void {
  useBackupCode.value = !useBackupCode.value;
  otpCode.value = '';
  backupCode.value = '';
}

async function onVerify2FA(): Promise<void> {
  if (!canVerify2FA.value) return;
  try {
    await authStore.verify2FA(useBackupCode.value ? backupCode.value.trim() : otpCode.value);
  } catch (error: unknown) {
    toast.add({ severity: 'error', detail: extractErrorMessage(error) ?? t('views.login.2fa_invalid_code'), life: 3000 });
    otpCode.value = '';
    backupCode.value = '';
  }
}

function onCancel2FA(): void {
  authStore.cancel2FA();
  otpCode.value = '';
  backupCode.value = '';
  useBackupCode.value = false;
}

watch(otpCode, (code) => {
  if (code.length === OTP_LENGTH) onVerify2FA();
});

watch(
  () => isOnline.value || isNeedsAuth.value,
  async (reachable) => {
    if (!reachable) return;
    if (!movedAway.value) movedAway.value = (await movedAwayStateFn().catch(() => null)) !== null;
    if (!restoreNotice.value) restoreNotice.value = await loginNotice();
  },
  { immediate: true },
);

onMounted(async () => {
  if (!isCapacitor) return;
  const serverId = credentialsServerKey();
  const [biometry, hasCreds] = await Promise.all([checkBiometryAvailable(), hasStoredCredentials(serverId)]);
  biometryAvailable.value = biometry.available;
  hasCredsForServer.value = hasCreds;
});
</script>
