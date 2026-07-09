<template>
  <div>
    <div class="flex flex-col w-full gap-6">
      <div v-if="!isElectronBuild">
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

              <div v-if="(isElectronApp && latestElectronVersion) || !isElectronBuild" class="flex w-full items-center gap-2">
                <div class="ml-auto"></div>

                <Button
                  v-if="isElectronApp && latestElectronVersion"
                  :disabled="!isElectronApp"
                  :loading="isLoading"
                  class="cui-button-medium"
                  :label="`${$t('components.form.button.update')} (v${latestElectronVersion})`"
                  @click="installElectronUpdate"
                />

                <Button
                  v-if="!isElectronBuild && restartRequired"
                  :loading="isLoading"
                  :disabled="actionsDisabled"
                  class="cui-button-medium"
                  :label="`${$t('components.form.button.restart')} (v${installedVersion})`"
                  @click="openDialog('restart')"
                />

                <Button
                  v-else-if="!isElectronBuild && installVersion"
                  :loading="isLoading"
                  :disabled="actionsDisabled"
                  class="cui-button-medium"
                  :label="`${$t('components.form.button.update')} (v${installVersion})`"
                  @click="openDialog('install')"
                />

                <Button
                  v-if="!isElectronBuild"
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
              <Button
                :loading="loadingCert || isLoading"
                :disabled="actionsDisabled"
                class="cui-button-medium ml-auto"
                :label="$t('components.form.button.download')"
                @click="downloadCert"
              />
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
import { compareVersions } from 'compare-versions';

import { ApiQuery } from '@/api/routes/api.js';
import { downloadCertFn, ServerQuery } from '@/api/routes/server.js';
import { asyncComponent } from '@/common/asyncComponent.js';
import { isCapacitor } from '@/connection/index.js';

import type { VersionsHandlerProps } from '@/components/CuiDialog/templates/VersionsHandler/types.js';

const VersionsHandlerDialog = asyncComponent(() => import('@/components/CuiDialog/templates/VersionsHandler/VersionsHandler.vue'));

const apiQuery = new ApiQuery();
const serverQuery = new ServerQuery();

const log = useLogger();
const dialog = useCuiDialog();
const { t } = useI18n();
const { isElectronApp, electron } = useElectron();
const { isOnline } = useConnection();
const { restarting, beginServerRestart } = useServerRestart();
const { isBeta, setChannel } = useUpdateChannel();
const { appVersion, nativeVersion, refreshAppVersion } = useAppVersion();

const authStore = useAuthStore();

serverQuery.toggleQueryActivator('checkVersionQuery', false);

const { data: apiInfo, isBusy: apiInfoLoading } = apiQuery.apiInfoQuery();
const { data: versionInfo, isBusy: versionLoading } = serverQuery.checkVersionQuery();
const { mutate: restartServer, isPending: restartServerLoading } = serverQuery.restartServerQuery();
const { mutateAsync: resetServer, isPending: resetServerLoading } = serverQuery.resetServerQuery();

const currentVersion = ref(t('views.settings.unknown'));
const currentElectronVersion = ref(t('views.settings.unknown'));
const latestAlphaVersion = ref<string>();
const latestBetaVersion = ref<string>();
const latestVersion = ref<string>();
const latestElectronVersion = ref<string>();
const loadingCert = ref(false);
const isUpdatingElectron = ref(false);
const isCheckingForElectronVersion = ref(false);
const isCheckingForElectronUpdates = ref(false);

const isElectronBuild = computed(() => apiInfo.value?.electron ?? false);

const isLoading = computed(() => {
  return (
    restartServerLoading.value ||
    resetServerLoading.value ||
    apiInfoLoading.value ||
    versionLoading.value ||
    isCheckingForElectronUpdates.value ||
    isUpdatingElectron.value
  );
});

const installedVersion = computed(() => apiInfo.value?.installedVersion || apiInfo.value?.version);

const restartRequired = computed(() => apiInfo.value?.restartRequired ?? false);

const actionsDisabled = computed(() => isLoading.value || !isOnline.value || restarting.value);

const updateAvailable = computed(() => {
  if (installedVersion.value && latestVersion.value) {
    return compareVersions(latestVersion.value, installedVersion.value) === 1;
  }

  return false;
});

const updateAvailableAlpha = computed(() => {
  if (installedVersion.value && latestAlphaVersion.value) {
    return compareVersions(latestAlphaVersion.value, installedVersion.value) === 1;
  }

  return false;
});

const updateAvailableBeta = computed(() => {
  if (isBeta.value && installedVersion.value && latestBetaVersion.value) {
    return compareVersions(latestBetaVersion.value, installedVersion.value) === 1;
  }

  return false;
});

const installVersion = computed(() => {
  const candidates = [
    updateAvailable.value ? latestVersion.value : undefined,
    updateAvailableBeta.value ? latestBetaVersion.value : undefined,
    updateAvailableAlpha.value ? latestAlphaVersion.value : undefined,
  ].filter((v): v is string => Boolean(v));

  if (!candidates.length) return undefined;

  return candidates.sort((a, b) => compareVersions(b, a))[0];
});

function onBetaToggle(next: boolean | string | undefined): void {
  setChannel(next === true ? 'beta' : 'production');
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

function openDialog(type: 'restart' | 'reset' | 'versions' | 'install') {
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
    case 'install':
      dialog.openComponentDialog<VersionsHandlerProps>(VersionsHandlerDialog, {
        data: {
          title: t('components.dialog.title.install_version'),
          confirmText: type === 'install' ? t('components.form.button.update') : t('components.form.button.install'),
          loading: isLoading,
          contentProps: {
            target: { type: 'server' },
            installVersion: type === 'install' ? installVersion.value : undefined,
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
    isCheckingForElectronVersion.value = true;
    currentElectronVersion.value = (await electron!.invoke('get-app-version')) ?? t('views.settings.unknown');
  } catch (error) {
    log.error('Error getting electron app version:', error);
  } finally {
    isCheckingForElectronVersion.value = false;
  }
}

async function checkElectronUpdates() {
  if (!isElectronApp) {
    return;
  }

  try {
    isCheckingForElectronUpdates.value = true;
    const response: { isUpdateAvailable: boolean; version: string } = await electron!.invoke('get-update-available');
    latestElectronVersion.value = response.isUpdateAvailable ? response.version : undefined;
  } catch (error) {
    log.error('Error checking for electron updates:', error);
  } finally {
    isCheckingForElectronUpdates.value = false;
  }
}

async function installElectronUpdate() {
  if (!isElectronApp) {
    return;
  }

  try {
    isUpdatingElectron.value = true;
    await electron!.invoke('quit-and-install');
  } catch (error) {
    log.error('Error installing electron update:', error);
  } finally {
    isUpdatingElectron.value = false;
  }
}

watch(
  apiInfo,
  () => {
    currentVersion.value = apiInfo.value?.version || t('views.settings.unknown');
    if (apiInfo.value) {
      serverQuery.toggleQueryActivator('checkVersionQuery', !isElectronBuild.value);
    }
  },
  { deep: true, immediate: true },
);

watch(
  versionInfo,
  () => {
    latestVersion.value = versionInfo.value?.['dist-tags'].latest;
    latestAlphaVersion.value = versionInfo.value?.['dist-tags'].alpha;
    latestBetaVersion.value = versionInfo.value?.['dist-tags'].beta;
  },
  { deep: true, immediate: true },
);

watch(isOnline, (online, wasOnline) => {
  if (online && !wasOnline && !isElectronBuild.value) {
    apiQuery.queryClient.invalidateQueries({ queryKey: ['api'] });
    serverQuery.queryClient.invalidateQueries({ queryKey: ['version'] });
  }
});

onMounted(() => {
  if (isCapacitor) {
    refreshAppVersion();
  }
  if (isElectronApp) {
    checkElectronVersion();
    checkElectronUpdates();
  }
});
</script>

<style scoped></style>
