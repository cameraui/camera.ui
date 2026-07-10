<template>
  <div>
    <div class="flex flex-col w-full gap-6">
      <div>
        <span class="card-title">{{ $t('views.settings.create_backup') }}</span>
        <Card class="cui-card">
          <template #content>
            <div class="flex flex-col gap-6">
              <span class="text-sm">{{ $t('views.settings.create_backup_info') }}</span>
              <Button :loading="isLoading" class="ml-auto cui-button-medium" :label="$t('components.form.button.download_backup_archive')" @click="downloadBackup" />
            </div>
          </template>
        </Card>
      </div>

      <div>
        <span class="card-title">{{ $t('views.settings.restore_backup') }}</span>
        <Card class="cui-card">
          <template #content>
            <div class="flex flex-col gap-6">
              <span class="text-sm">{{ $t('views.settings.restore_backup_info') }}</span>
              <CuiUploadFiles ref="filesRef" accept="application/gzip, .tar, .tar.gz" @files-uploaded="(files: File[]) => (uploadedFiles = files)" />
              <Button
                :loading="isLoading"
                :disabled="!uploadedFiles.length"
                class="ml-auto cui-button-medium"
                :label="$t('components.form.button.restore_backup_archive')"
                @click="openDialog"
              />
            </div>
          </template>
        </Card>
      </div>

      <div>
        <span class="card-title">{{ $t('views.settings.scheduled_backup') }}</span>
        <Card class="cui-card">
          <template #content>
            <div v-if="schedulerLoading" class="flex w-full items-center justify-center py-6">
              <ProgressSpinner class="w-[30px] h-[30px] m-0" stroke-width="5" />
            </div>

            <div v-else class="flex flex-col gap-6">
              <div class="flex items-center gap-4">
                <div class="flex flex-col gap-1 min-w-0">
                  <span class="text-sm">{{ $t('views.settings.scheduled_backup_info') }}</span>
                  <span class="text-xs text-muted">{{ lastRunText }}</span>
                </div>
                <ToggleSwitch v-model="schedulerForm.enabled" :disabled="schedulerSaving" class="ml-auto shrink-0" />
              </div>

              <template v-if="schedulerForm.enabled">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div class="flex flex-col field-gap">
                    <label for="backupInterval" class="cui-label">{{ $t('views.settings.backup_interval') }}</label>
                    <Select
                      v-model="schedulerForm.interval"
                      input-id="backupInterval"
                      :options="intervalOptions"
                      option-label="label"
                      option-value="value"
                      :disabled="schedulerSaving"
                    />
                  </div>

                  <div class="flex flex-col field-gap">
                    <label for="backupTime" class="cui-label">{{ $t('views.settings.backup_time') }}</label>
                    <InputText id="backupTime" v-model="schedulerForm.time" placeholder="03:00" :disabled="schedulerSaving" :invalid="!timeValid" />
                  </div>

                  <div v-if="schedulerForm.interval === 'weekly'" class="flex flex-col field-gap">
                    <label for="backupWeekday" class="cui-label">{{ $t('views.settings.backup_weekday') }}</label>
                    <Select
                      v-model="schedulerForm.weekday"
                      input-id="backupWeekday"
                      :options="weekdayOptions"
                      option-label="label"
                      option-value="value"
                      :disabled="schedulerSaving"
                    />
                  </div>

                  <div v-if="schedulerForm.interval === 'monthly'" class="flex flex-col field-gap">
                    <label for="backupDayOfMonth" class="cui-label">{{ $t('views.settings.backup_day_of_month') }}</label>
                    <InputNumber
                      v-model="schedulerForm.dayOfMonth"
                      input-id="backupDayOfMonth"
                      :min="1"
                      :max="28"
                      show-buttons
                      :use-grouping="false"
                      :disabled="schedulerSaving"
                    />
                  </div>

                  <div class="flex flex-col field-gap">
                    <label for="backupRetention" class="cui-label">{{ $t('views.settings.backup_retention') }}</label>
                    <InputNumber
                      v-model="schedulerForm.retention"
                      input-id="backupRetention"
                      :min="1"
                      :max="60"
                      show-buttons
                      :use-grouping="false"
                      :disabled="schedulerSaving"
                    />
                    <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('views.settings.backup_retention_hint') }}</Message>
                  </div>
                </div>

                <div class="flex flex-col field-gap">
                  <label for="backupDestination" class="cui-label">{{ $t('views.settings.backup_destination') }}</label>
                  <InputText id="backupDestination" v-model="schedulerForm.destinationPath" :placeholder="defaultDestination" :disabled="schedulerSaving" />
                  <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('views.settings.backup_destination_hint') }}</Message>
                </div>
              </template>

              <div class="flex items-center gap-2">
                <Button
                  severity="secondary"
                  outlined
                  :loading="schedulerRunning"
                  :disabled="schedulerSaving"
                  class="ml-auto cui-button-medium"
                  :label="$t('components.form.button.run_now')"
                  @click="runSchedulerNow"
                />
                <Button
                  :loading="schedulerSaving"
                  :disabled="schedulerRunning || !timeValid"
                  class="cui-button-medium"
                  :label="$t('components.form.button.save')"
                  @click="saveScheduler"
                />
              </div>

              <div v-if="scheduledBackups.length" class="flex flex-col gap-2">
                <span class="text-sm font-semibold border-b-[1px] border-color pb-2">{{ $t('views.settings.backup_existing') }}</span>

                <div v-for="backup in scheduledBackups" :key="backup.filename" class="flex items-center gap-3 py-1 min-w-0">
                  <div class="flex flex-col min-w-0">
                    <span class="text-sm truncate">{{ backup.filename }}</span>
                    <span class="text-xs text-muted">{{ new Date(backup.timestamp).toLocaleString() }} · {{ formatBytes(backup.size) }}</span>
                  </div>

                  <div class="flex gap-1 ml-auto shrink-0">
                    <Button
                      v-tooltip.top="{ value: $t('components.form.button.download') }"
                      text
                      rounded
                      severity="secondary"
                      class="cui-icon-md"
                      :disabled="downloadingBackup === backup.filename"
                      @click="downloadScheduled(backup)"
                    >
                      <template #icon>
                        <i-mdi:download width="100%" height="100%" />
                      </template>
                    </Button>
                    <Button
                      v-tooltip.top="{ value: $t('components.form.button.remove') }"
                      text
                      rounded
                      severity="danger"
                      class="cui-icon-md"
                      @click="confirmDeleteScheduled(backup)"
                    >
                      <template #icon>
                        <i-mdi:trash-can-outline width="100%" height="100%" />
                      </template>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </Card>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  deleteScheduledBackupFn,
  downloadBackupFn,
  downloadScheduledBackupFn,
  getBackupSchedulerFn,
  patchBackupSchedulerFn,
  runBackupSchedulerFn,
} from '@/api/routes/backup.js';
import { extractErrorMessage } from '@/common/utils.js';

import type CuiUploadFiles from '@/components/CuiUploadFIles/CuiUploadFiles.vue';
import type { DBBackupSchedulerLastRun, DBBackupSchedulerSettings, ScheduledBackupEntry, UiLocalStorage, UserLanguage } from '@shared/types';

const dialog = useCuiDialog();
const toast = useCuiToast();
const { t, locale } = useI18n();

const filesRef = useTemplateRef<InstanceType<typeof CuiUploadFiles>>('filesRef');
const uploadedFiles = shallowRef<File[]>([]);
const isLoading = ref(false);
const schedulerLoading = ref(true);
const schedulerSaving = ref(false);
const schedulerRunning = ref(false);
const downloadingBackup = ref<string | null>(null);
const scheduledBackups = ref<ScheduledBackupEntry[]>([]);
const defaultDestination = ref('');
const lastRun = ref<DBBackupSchedulerLastRun>();
const schedulerForm = reactive<Omit<DBBackupSchedulerSettings, 'lastRun'>>({
  enabled: false,
  interval: 'daily',
  time: '03:00',
  weekday: 0,
  dayOfMonth: 1,
  retention: 7,
  destinationPath: '',
});

const timeValid = computed(() => /^([01]\d|2[0-3]):[0-5]\d$/.test(schedulerForm.time));

const intervalOptions = computed(() => (['daily', 'weekly', 'monthly'] as const).map((value) => ({ label: t(`views.settings.backup_interval_${value}`), value })));

const weekdayOptions = computed(() =>
  Array.from({ length: 7 }, (_, i) => ({
    label: new Intl.DateTimeFormat(locale.value, { weekday: 'long' }).format(new Date(Date.UTC(2024, 0, 7 + i, 12))),
    value: i,
  })),
);

const lastRunText = computed(() => {
  if (!lastRun.value) return t('views.settings.backup_last_run', { info: t('views.settings.backup_last_run_never') });
  const date = new Date(lastRun.value.timestamp).toLocaleString();
  const status = lastRun.value.status === 'success' ? '✓' : `✗ ${lastRun.value.message ?? ''}`;
  return t('views.settings.backup_last_run', { info: `${date} ${status}` });
});

async function downloadBackup(): Promise<void> {
  isLoading.value = true;

  try {
    const uiLocalStorage: Partial<UiLocalStorage> = {};

    if (localStorage.getItem('ui')) {
      const ui = localStorage.getItem('ui');
      uiLocalStorage.ui = JSON.parse(ui!);
    }

    if (localStorage.getItem('language')) {
      const language = localStorage.getItem('language');
      uiLocalStorage.language = language as UserLanguage;
    }

    if (localStorage.getItem('theme')) {
      const theme = localStorage.getItem('theme');
      uiLocalStorage.theme = JSON.parse(theme!);
    }

    const timestamp = Date.now();
    const response = await downloadBackupFn(uiLocalStorage);

    await download({
      blob: new Blob([response]),
      filename: `cameraui-backup-${timestamp}.tar.gz`,
      mimeType: 'application/gzip',
    });
  } catch (error: any) {
    toast.add({ severity: 'error', detail: extractErrorMessage(error), life: 3000 });
  }

  isLoading.value = false;
}

function openDialog() {
  dialog.openTextDialog({
    data: {
      title: t('components.dialog.title.confirm'),
      contentText: t('components.dialog.message.confirm_restore'),
      confirmText: t('components.form.button.restore_and_restart'),
      loading: isLoading,
    },
    onConfirm: restoreBackup,
  });
}

async function restoreBackup(): Promise<void> {
  const file = uploadedFiles.value[0];
  if (!file) return;

  isLoading.value = true;
  await useBackupRestore().run(file);
  filesRef.value?.reset();
  isLoading.value = false;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = -1;
  do {
    value /= 1024;
    unit++;
  } while (value >= 1024 && unit < units.length - 1);
  return `${value.toFixed(1)} ${units[unit]}`;
}

async function loadScheduler(): Promise<void> {
  try {
    const state = await getBackupSchedulerFn();
    const { lastRun: storedLastRun, ...settings } = state.settings;
    Object.assign(schedulerForm, settings);
    lastRun.value = storedLastRun;
    scheduledBackups.value = state.backups;
    defaultDestination.value = state.defaultDestination;
  } catch (error: any) {
    toast.add({ severity: 'error', detail: extractErrorMessage(error), life: 3000 });
  } finally {
    schedulerLoading.value = false;
  }
}

async function saveScheduler(): Promise<void> {
  if (!timeValid.value) return;

  schedulerSaving.value = true;
  try {
    const settings = await patchBackupSchedulerFn({ ...schedulerForm });
    lastRun.value = settings.lastRun;
    toast.add({ severity: 'success', detail: t('components.toast.backup_scheduler_saved'), life: 3000 });
  } catch (error: any) {
    toast.add({ severity: 'error', detail: extractErrorMessage(error), life: 3000 });
  } finally {
    schedulerSaving.value = false;
  }
}

async function runSchedulerNow(): Promise<void> {
  schedulerRunning.value = true;
  try {
    const result = await runBackupSchedulerFn();
    lastRun.value = result;
    toast.add({ severity: 'success', detail: t('components.toast.backup_created'), life: 3000 });
  } catch (error: any) {
    toast.add({ severity: 'error', detail: extractErrorMessage(error), life: 3000 });
  } finally {
    schedulerRunning.value = false;
    await loadScheduler();
  }
}

async function downloadScheduled(backup: ScheduledBackupEntry): Promise<void> {
  downloadingBackup.value = backup.filename;
  try {
    const data = await downloadScheduledBackupFn(backup.filename);
    await download({ blob: new Blob([data]), filename: backup.filename, mimeType: 'application/gzip' });
  } catch (error: any) {
    toast.add({ severity: 'error', detail: extractErrorMessage(error), life: 3000 });
  } finally {
    downloadingBackup.value = null;
  }
}

function confirmDeleteScheduled(backup: ScheduledBackupEntry): void {
  dialog.openTextDialog({
    data: {
      title: t('components.dialog.title.confirm'),
      contentText: t('components.dialog.message.confirm_delete_backup', { filename: backup.filename }),
      confirmText: t('components.form.button.remove'),
    },
    onConfirm: async () => {
      try {
        await deleteScheduledBackupFn(backup.filename);
        toast.add({ severity: 'success', detail: t('components.toast.backup_deleted'), life: 3000 });
        await loadScheduler();
      } catch (error: any) {
        toast.add({ severity: 'error', detail: extractErrorMessage(error), life: 3000 });
      }
    },
  });
}

onMounted(loadScheduler);
</script>

<style scoped></style>
