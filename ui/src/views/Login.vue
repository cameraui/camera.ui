<template>
  <CuiAuthCard :logo-url="getImageUrl('logo_animated.svg')">
    <template v-if="canGoBack || showCloudButton" #footer-left>
      <Button v-if="canGoBack" severity="secondary" text size="small" class="text-muted" :label="$t('components.instance_switcher.go_back')" @click="goBack">
        <template #icon>
          <i-mdi:arrow-left class="w-4 h-4" />
        </template>
      </Button>
      <Button v-else severity="secondary" text size="small" class="text-muted" :label="$t('views.login.pick_server')" @click="goToCloud">
        <template #icon>
          <i-mdi:cloud-outline class="w-4 h-4" />
        </template>
      </Button>
    </template>

    <Transition name="slide-fade" mode="out-in">
      <div v-if="showConnecting" key="connecting" class="flex flex-col items-center justify-center h-full gap-4">
        <ProgressSpinner stroke-width="4" class="!w-12 !h-12" />
        <p class="text-muted text-sm text-center">{{ connectingText }}</p>
        <Button v-if="inTrouble" size="small" severity="secondary" :label="$t('connection.retry')" @click="onRetry" />
      </div>

      <Form v-else-if="!requires2FA" key="login" ref="formRef" :validation-schema="authValidationSchema" class="flex flex-col h-full" @submit="onLogin">
        <div class="flex flex-col gap-10 sm:gap-6 w-full mt-10 sm:mt-0">
          <Field v-slot="{ field, errors }" v-model.trim="username" name="username" as="div" class="flex flex-col field-gap">
            <label for="username" class="cui-label">{{ $t('components.form.label.username') }}</label>
            <InputGroup>
              <InputText :invalid="errors.length > 0" type="text" size="large" :loading="loginLoading" v-bind="field" />
            </InputGroup>
            <Transition name="fade">
              <ErrorMessage name="username" class="cui-input-error" />
            </Transition>
          </Field>

          <Field v-slot="{ field, errors }" v-model="password" name="password" as="div" class="flex flex-col field-gap">
            <label for="password" class="cui-label">{{ $t('components.form.label.password') }}</label>
            <InputGroup>
              <Password :invalid="errors.length > 0" size="large" :loading="loginLoading" :feedback="false" toggle-mask v-bind="field" />
            </InputGroup>
            <Transition name="fade">
              <ErrorMessage name="password" class="cui-input-error" />
            </Transition>
          </Field>
        </div>

        <div class="flex flex-col gap-6 mt-10">
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

          <Button type="submit" class="text-white font-semibold cui-button-large" :loading="loginLoading" :label="$t('components.form.button.login')" fluid />

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
        </div>
      </Form>

      <div v-else key="2fa" v-focustrap class="flex flex-col h-full">
        <div class="flex flex-col items-center text-center mt-10 sm:mt-0">
          <h2 class="text-lg font-semibold mb-2">{{ $t('views.login.2fa_title') }}</h2>
          <p class="text-muted text-sm">{{ useBackupCode ? $t('views.login.2fa_backup_description') : $t('views.login.2fa_description') }}</p>
        </div>

        <div class="flex flex-col items-center mt-10">
          <InputOtp v-if="!useBackupCode" v-model="otpCode" :length="OTP_LENGTH" integer-only size="large" @complete="onVerify2FA" />
          <InputText
            v-else
            v-model="backupCode"
            size="large"
            autocapitalize="characters"
            autocomplete="one-time-code"
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

        <div class="flex flex-col gap-3 mt-auto pt-10">
          <Button
            class="text-white font-semibold cui-button-large"
            :loading="loginLoading"
            :disabled="!canVerify2FA"
            :label="$t('views.login.2fa_verify')"
            fluid
            @click="onVerify2FA"
          />
          <Button severity="secondary" class="cui-button-large" text :label="$t('components.form.button.cancel')" fluid @click="onCancel2FA" />
        </div>
      </div>
    </Transition>
  </CuiAuthCard>
</template>

<script setup lang="ts">
import { ErrorMessage, Field, Form } from 'vee-validate';

import { CLOUD_SERVICE_URL } from '@/common/constants.js';
import { extractErrorMessage, getImageUrl } from '@/common/utils.js';
import CuiAuthCard from '@/components/CuiAuthCard/CuiAuthCard.vue';
import { checkBiometryAvailable, clearCredentials, hasStoredCredentials, saveCredentials, unlockCredentials } from '@/composables/useBiometricCredentials.js';
import { getDeviceId, getDeviceName } from '@/composables/useDeviceIdentity.js';
import { clearCapacitorCloudPreferences } from '@/connection/cloudHandoff.js';
import { useBootMode } from '@/connection/index.js';
import { isCapacitor } from '@/connection/runtime.js';
import { authValidationSchema } from '@/schemas/users.schema.js';

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

const canGoBack = computed(() => !instanceStore.isHomeActive || instanceStore.redirectInfo !== null);
const canVerify2FA = computed(() => (useBackupCode.value ? backupCode.value.trim().length === BACKUP_CODE_LENGTH : otpCode.value.length === OTP_LENGTH));
const showCloudButton = computed(() => mode === 'cloud' && instanceStore.isHomeActive);
const showConnecting = computed(() => !isOnline.value && !isNeedsAuth.value && !loginLoading.value && !requires2FA.value);
const connectingText = computed(() => (inTrouble.value ? t('connection.unreachable') : t('connection.connecting_remote')));

const biometricButtonVisible = computed(() => isCapacitor && biometryAvailable.value && hasCredsForServer.value);

function onRetry() {
  connection.retry();
}

function goBack() {
  if (instanceStore.redirectInfo) {
    // Arrived via full-page redirect — navigate back to source URL
    const src = instanceStore.redirectInfo.sourceUrl;
    instanceStore.redirectInfo = null;
    window.location.href = src;
    return;
  }
  // In-app switch back to home
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
  const serverId = await readCurrentServerId();
  if (!serverId) return;
  biometricLoading.value = true;
  try {
    const creds = await unlockCredentials(serverId, t('views.login.biometric_reason'));
    if (!creds) return;
    username.value = creds.username;
    password.value = creds.password;
    const ok = await performLogin(creds);
    if (!ok) {
      // Stale credentials (server password changed). Drop them so next time
      // we don't keep prompting biometric for a dead login.
      await clearCredentials(serverId);
      hasCredsForServer.value = false;
    }
  } finally {
    biometricLoading.value = false;
  }
}

async function readCurrentServerId(): Promise<string | null> {
  if (!isCapacitor) return null;
  try {
    const { Preferences } = await import('@capacitor/preferences');
    const { value } = await Preferences.get({ key: 'currentServerId' });
    return value ?? null;
  } catch {
    return null;
  }
}

async function maybePromptSaveCredentials(creds: { username: string; password: string }): Promise<void> {
  if (!isCapacitor) return;
  if (!biometryAvailable.value) return;
  const serverId = await readCurrentServerId();
  if (!serverId) return;
  // Already saved (e.g. user logging in via biometric or via re-login after
  // manual edit) → just refresh the storage with the latest password.
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
        // localStorage unavailable — degrade gracefully (we'll re-prompt next login)
      }
    },
  });
}

async function goToCloud(): Promise<void> {
  if (isCapacitor) {
    try {
      const { SplashScreen } = await import('@capacitor/splash-screen');
      await SplashScreen.show({ autoHide: false, fadeInDuration: 0 });
    } catch {
      // best-effort
    }
    // Clear Capacitor cloud handoff state — cloud frontend bundle (index.html)
    // takes over after replace. Wiping preferences here ensures we don't try
    // to bypass the server-pick flow on next launch.
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

onMounted(async () => {
  if (!isCapacitor) return;
  const serverId = await readCurrentServerId();
  const [biometry, hasCreds] = await Promise.all([checkBiometryAvailable(), hasStoredCredentials(serverId)]);
  biometryAvailable.value = biometry.available;
  hasCredsForServer.value = hasCreds;
});
</script>

<style scoped>
.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.3s ease;
}

.slide-fade-enter-from {
  opacity: 0;
  transform: translateX(20px);
}

.slide-fade-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}
</style>
