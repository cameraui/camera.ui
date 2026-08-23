<template>
  <div>
    <div class="flex flex-col w-full gap-6">
      <div>
        <Card class="cui-card">
          <template #content>
            <div>
              <div class="flex items-center gap-4">
                <div class="flex flex-col field-switch-gap">
                  <label for="betaChannel" class="cui-label-switch">{{ $t('views.settings.beta_updates') }}</label>
                  <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint">
                    {{ $t('views.settings.beta_updates_info') }}
                  </Message>
                </div>
                <ToggleSwitch input-id="betaChannel" :model-value="isBeta" class="ml-auto shrink-0" @update:model-value="onBetaToggle" />
              </div>
            </div>
          </template>
        </Card>
      </div>

      <div>
        <span class="card-title">camera.ui</span>
        <Card class="cui-card">
          <template #content>
            <div class="flex flex-col gap-6">
              <div v-if="isElectronApp" class="flex flex-row items-center justify-between">
                <span class="text-sm">{{ $t('views.settings.app') }}</span>
                <ProgressSpinner v-if="isLoading" class="w-[15px] h-[15px] m-0" stroke-width="5" />
                <span v-else class="text-sm font-bold">v{{ currentElectronVersion }}</span>
              </div>

              <div v-if="isCapacitor && appVersion" class="flex flex-row items-center justify-between">
                <span class="text-sm">{{ $t('views.settings.app') }}</span>
                <span class="text-sm font-bold">
                  v{{ appVersion }}<span v-if="nativeVersion && nativeVersion !== appVersion" class="text-muted font-normal"> ({{ nativeVersion }})</span>
                </span>
              </div>

              <div class="flex flex-row items-center justify-between">
                <span class="text-sm">{{ $t('views.settings.server') }}</span>
                <ProgressSpinner v-if="isLoading" class="w-[15px] h-[15px] m-0" stroke-width="5" />
                <span v-else class="text-sm font-bold">
                  v{{ currentVersion }}<template v-if="restartRequired"> &rarr; v{{ installedVersion }}</template>
                </span>
              </div>

              <div v-if="!isElectronBuild" class="flex w-full items-center gap-2">
                <div class="ml-auto"></div>

                <Button
                  v-if="restartRequired"
                  :loading="isLoading"
                  :disabled="actionsDisabled"
                  class="cui-button-medium"
                  :label="`${$t('components.form.button.restart')} (v${installedVersion})`"
                  @click="openDialog('restart')"
                />

                <Button
                  :loading="isLoading"
                  :disabled="actionsDisabled"
                  class="cui-button-medium"
                  :label="$t('components.form.button.manage')"
                  @click="openDialog('versions')"
                />
              </div>
            </div>
          </template>
        </Card>
      </div>

      <div v-if="!isElectronApp">
        <span class="card-title">{{ $t('views.settings.certificate') }}</span>
        <Card class="cui-card">
          <template #content>
            <div class="flex flex-col gap-6">
              <span class="text-sm">{{ $t('views.settings.certificate_info') }}</span>

              <div v-if="canManageCertificate" class="flex flex-col gap-2">
                <span class="cui-label">{{ $t('views.settings.custom_certificate') }}</span>

                <Message v-if="certificateState?.problem" severity="error" :closable="false">
                  {{ $t(`views.settings.certificate_problem_${certificateState.problem.code.replace('-', '_')}`) }}
                </Message>

                <template v-else-if="certificateState?.info">
                  <div class="flex justify-between gap-4 text-sm">
                    <span class="text-muted shrink-0">{{ $t('views.settings.certificate_names') }}</span>
                    <span class="text-right break-all">{{ certificateState.info.names.join(', ') }}</span>
                  </div>
                  <div class="flex justify-between gap-4 text-sm">
                    <span class="text-muted shrink-0">{{ $t('views.settings.certificate_issuer') }}</span>
                    <span class="text-right break-all">{{ certificateState.info.issuer }}</span>
                  </div>
                  <div class="flex justify-between gap-4 text-sm">
                    <span class="text-muted shrink-0">{{ $t('views.settings.certificate_valid_to') }}</span>
                    <span class="text-right">{{ certificateState.info.validTo }}</span>
                  </div>
                  <Message v-if="chainMissing" severity="warn" class="mt-2" :closable="false">
                    {{ $t('views.settings.certificate_chain_missing') }}
                  </Message>
                </template>

                <span v-else class="text-sm text-muted">{{ $t('views.settings.certificate_none') }}</span>
              </div>

              <div class="flex flex-wrap gap-2 ml-auto">
                <Button
                  v-if="canManageCertificate && certificateState?.present"
                  severity="danger"
                  outlined
                  :loading="certificateBusy"
                  class="cui-button-medium"
                  :label="$t('components.form.button.remove')"
                  @click="confirmDropCertificate"
                />
                <Button
                  :loading="loadingCert || isLoading"
                  :disabled="actionsDisabled"
                  severity="secondary"
                  outlined
                  class="cui-button-medium"
                  :label="$t('components.form.button.download')"
                  @click="downloadCert"
                />
                <Button
                  v-if="canManageCertificate"
                  :loading="certificateBusy"
                  class="cui-button-medium"
                  :label="$t('components.form.button.upload')"
                  @click="openCertificateUpload"
                />
              </div>
            </div>
          </template>
        </Card>
      </div>

      <div>
        <span class="card-title">{{ $t('views.settings.restart_server') }}</span>
        <Card class="cui-card">
          <template #content>
            <div class="flex flex-col gap-6">
              <span class="text-sm">{{ $t('views.settings.restart_server_info') }}</span>
              <Button
                :loading="isLoading"
                :disabled="actionsDisabled"
                class="cui-button-medium ml-auto"
                :label="$t('components.form.button.restart')"
                @click="openDialog('restart')"
              />
            </div>
          </template>
        </Card>
      </div>

      <div v-if="hasPermission(undefined, 'master')">
        <span class="card-title">{{ $t('views.settings.reset_server') }}</span>
        <Card class="cui-card !border-red-900">
          <template #content>
            <div class="flex flex-col gap-6">
              <span class="text-sm">{{ $t('views.settings.reset_server_info') }}</span>
              <Button
                :loading="isLoading"
                :disabled="actionsDisabled"
                class="cui-button-medium ml-auto"
                :label="$t('components.form.button.reset')"
                @click="openDialog('reset')"
              />
            </div>
          </template>
        </Card>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ApiQuery, apiInfo as fetchApiInfo } from '@/api/routes/api.js';
import { downloadCertFn, getCertificate, removeCertificate, restartGo2RtcFn, ServerQuery, uploadCertificate } from '@/api/routes/server.js';
import { asyncComponent } from '@/common/asyncComponent.js';
import { isCapacitor } from '@/connection/index.js';

import type { CertificateUploadResult } from '@/components/CuiDialog/templates/CertificateUpload/types.js';
import type { VersionsHandlerProps } from '@/components/CuiDialog/templates/VersionsHandler/types.js';
import type { CustomCertificateState } from '@shared/types';

const VersionsHandlerDialog = asyncComponent(() => import('@/components/CuiDialog/templates/VersionsHandler/VersionsHandler.vue'));
const CertificateUploadDialog = asyncComponent(() => import('@/components/CuiDialog/templates/CertificateUpload/CertificateUpload.vue'));

const apiQuery = new ApiQuery();
const serverQuery = new ServerQuery();

const log = useLogger();
const dialog = useCuiDialog();
const toast = useCuiToast();
const { t } = useI18n();
const { isElectronApp, electron } = useElectron();
const { isOnline } = useConnection();
const { restarting, beginServerRestart } = useServerRestart();
const { isBeta, setBeta } = useUpdateChannel();
const { appVersion, nativeVersion, refreshAppVersion } = useAppVersion();

const authStore = useAuthStore();

const { data: apiInfo, isBusy: apiInfoLoading } = apiQuery.apiInfoQuery();
const { mutate: restartServer, isPending: restartServerLoading } = serverQuery.restartServerQuery();
const { mutateAsync: resetServer, isPending: resetServerLoading } = serverQuery.resetServerQuery();

const currentVersion = ref(t('views.settings.unknown'));
const currentElectronVersion = ref(t('views.settings.unknown'));
const loadingCert = ref(false);
const certificateState = shallowRef<CustomCertificateState | null>(null);
const certificateBusy = ref(false);

let refreshRun = 0;

const canManageCertificate = computed(() => !isElectronApp && hasPermission(undefined, 'master'));

const chainMissing = computed(() => {
  const info = certificateState.value?.info;
  return Boolean(info && info.chainLength <= 1 && !info.selfSigned);
});

const isElectronBuild = computed(() => apiInfo.value?.electron ?? false);

const isLoading = computed(() => {
  return restartServerLoading.value || resetServerLoading.value || apiInfoLoading.value;
});

const installedVersion = computed(() => apiInfo.value?.installedVersion || apiInfo.value?.version);

const restartRequired = computed(() => apiInfo.value?.restartRequired ?? false);

const actionsDisabled = computed(() => isLoading.value || !isOnline.value || restarting.value);

function onBetaToggle(next: boolean | string | undefined): void {
  setBeta(next === true);
}

async function downloadCert(): Promise<void> {
  if (loadingCert.value) {
    return;
  }

  loadingCert.value = true;

  try {
    const response = await downloadCertFn();
    const blob = new Blob([response], { type: 'application/x-x509-ca-cert' });
    await download({ blob, filename: 'cert.pem', mimeType: 'application/x-x509-ca-cert' });
  } catch (err) {
    log.error(err);
  }

  loadingCert.value = false;
}

function beginRestart(): void {
  beginServerRestart();
  restartServer();
}

function openDialog(type: 'restart' | 'reset' | 'versions') {
  switch (type) {
    case 'restart':
      dialog.openTextDialog({
        data: {
          title: t('components.dialog.title.restart'),
          confirmText: t('components.form.button.restart'),
          contentText: t('components.dialog.message.confirm_restart_server'),
          loading: isLoading,
        },
        onConfirm: beginRestart,
      });
      break;
    case 'reset':
      dialog.openTextDialog({
        data: {
          title: t('components.dialog.title.reset_server'),
          confirmText: t('components.form.button.reset'),
          contentText: t('components.dialog.message.confirm_reset_server'),
          loading: isLoading,
        },
        onConfirm: async () => {
          try {
            await resetServer();
          } catch {
            //
          } finally {
            authStore.logout();
          }
        },
      });
      break;
    case 'versions':
      dialog.openComponentDialog<VersionsHandlerProps>(VersionsHandlerDialog, {
        data: {
          title: t('components.dialog.title.install_version'),
          confirmText: t('components.form.button.install'),
          loading: isLoading,
          contentProps: {
            target: { type: 'server' },
          },
        },
      });
      break;
  }
}

async function checkElectronVersion() {
  if (!isElectronApp) {
    return;
  }

  try {
    currentElectronVersion.value = (await electron!.invoke('get-app-version')) ?? t('views.settings.unknown');
  } catch (error) {
    log.error('Error getting electron app version:', error);
  }
}

async function refreshAfterReconnect(): Promise<void> {
  const run = ++refreshRun;

  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      await fetchApiInfo({ signal: AbortSignal.timeout(5000) });
      if (run !== refreshRun) return;
      apiQuery.queryClient.invalidateQueries({ queryKey: ['api'] });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      if (run !== refreshRun || !isOnline.value) return;
    }
  }
}

function askGo2RtcRestart(): void {
  dialog.openTextDialog({
    data: {
      title: t('views.settings.certificate_restart_title'),
      confirmText: t('components.form.button.restart'),
      contentText: t('views.settings.certificate_restart_info'),
    },
    onConfirm: async () => {
      try {
        await restartGo2RtcFn();
        toast.add({ severity: 'success', detail: t('views.settings.certificate_restart_done'), life: 5000 });
      } catch (error: any) {
        toast.add({ severity: 'error', detail: error?.response?.data?.message ?? error?.message, life: 5000 });
      }
    },
  });
}

async function loadCertificateState(): Promise<void> {
  try {
    certificateState.value = await getCertificate();
  } catch (error) {
    log.error('Certificate state failed:', error);
  }
}

function openCertificateUpload(): void {
  dialog.openComponentDialog(CertificateUploadDialog, {
    data: {
      title: t('views.settings.certificate_upload_title'),
      confirmText: t('components.form.button.upload'),
      contentProps: { hasCertificate: certificateState.value?.present === true },
    },
    onConfirm: (files: CertificateUploadResult) => sendCertificate(files),
  });
}

async function sendCertificate(files: CertificateUploadResult): Promise<void> {
  certificateBusy.value = true;
  try {
    certificateState.value = await uploadCertificate(files);
    toast.add({ severity: 'success', detail: t('views.settings.certificate_stored'), life: 5000 });
    askGo2RtcRestart();
  } catch (error: any) {
    toast.add({ severity: 'error', detail: error?.response?.data?.message ?? error?.message, life: 5000 });
  } finally {
    certificateBusy.value = false;
  }
}

function confirmDropCertificate(): void {
  dialog.openTextDialog({
    data: {
      title: t('views.settings.certificate_remove_title'),
      confirmText: t('components.form.button.remove'),
      contentText: t('views.settings.certificate_remove_confirm'),
      loading: certificateBusy,
    },
    onConfirm: dropCertificate,
  });
}

async function dropCertificate(): Promise<void> {
  certificateBusy.value = true;
  try {
    certificateState.value = await removeCertificate();
    toast.add({ severity: 'success', detail: t('views.settings.certificate_removed'), life: 5000 });
    askGo2RtcRestart();
  } catch (error: any) {
    toast.add({ severity: 'error', detail: error?.response?.data?.message ?? error?.message, life: 5000 });
  } finally {
    certificateBusy.value = false;
  }
}

watch(
  apiInfo,
  () => {
    currentVersion.value = apiInfo.value?.version || t('views.settings.unknown');
  },
  { deep: true, immediate: true },
);

watch([isOnline, restarting], ([online, restart], [wasOnline, wasRestart]) => {
  if (isElectronBuild.value) return;

  const reconnected = online && !wasOnline;
  const restartEnded = wasRestart && !restart && online;

  if (reconnected || restartEnded) {
    refreshAfterReconnect();
  }
});

onBeforeUnmount(() => {
  refreshRun++;
});

onMounted(() => {
  if (isCapacitor) {
    refreshAppVersion();
  }
  if (isElectronApp) {
    checkElectronVersion();
  }
  if (canManageCertificate.value) {
    loadCertificateState();
  }
});
</script>

<style scoped></style>
