<template>
  <div>
    <div class="flex flex-col w-full gap-6">
      <div>
        <span class="card-title">{{ $t('views.settings.create_backup') }}</span>
        <Card class="cui-card">
          <template #content>
            <div class="flex flex-col gap-6">
              <span class="text-sm">{{ $t('views.settings.create_backup_info') }}</span>

              <div v-if="job?.state === 'running'" class="flex flex-col gap-2">
                <span class="text-xs text-muted">{{ jobText }}</span>
                <ProgressBar :mode="jobPercent === null ? 'indeterminate' : 'determinate'" :value="jobPercent ?? 0" :show-value="false" class="h-2" />
              </div>

              <div class="flex items-center gap-4">
                <span class="text-xs text-muted">{{ lastBackupText }}</span>
                <Button
                  :loading="isLoading || job?.state === 'running'"
                  class="ml-auto shrink-0 cui-button-medium"
                  :label="$t('components.form.button.download_backup_archive')"
                  @click="downloadBackup"
                />
              </div>
            </div>
          </template>
        </Card>
      </div>

      <div v-if="backupKey">
        <span class="card-title">{{ $t('views.settings.backup_key') }}</span>
        <Card class="cui-card">
          <template #content>
            <div class="flex flex-col gap-6">
              <span class="text-sm">{{ $t('views.settings.backup_key_info') }}</span>

              <div class="flex flex-col field-gap">
                <InputGroup>
                  <InputText :model-value="backupKey.key" readonly type="text" class="font-mono" />
                  <InputGroupAddon>
                    <CuiActionButton
                      :action-text="$t('views.settings.backup_key_copied')"
                      :icon="CopyIcon"
                      :button-props="{
                        severity: 'secondary',
                        text: true,
                      }"
                      @action="copyToClipboard(backupKey.key)"
                    />
                  </InputGroupAddon>
                </InputGroup>
                <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">
                  {{
                    backupKey.confirmedAt
                      ? $t('views.settings.backup_key_saved', { date: new Date(backupKey.confirmedAt).toLocaleDateString() })
                      : $t('views.settings.backup_key_not_saved')
                  }}
                </Message>
              </div>

              <div class="flex gap-2 ml-auto">
                <Button severity="secondary" outlined class="cui-button-medium" :label="$t('views.settings.backup_key_save')" @click="saveKeyFile" />
                <Button v-if="!backupKey.confirmedAt" class="cui-button-medium" :label="$t('views.settings.backup_key_dialog_confirm')" @click="confirmKey" />
              </div>
            </div>
          </template>
        </Card>
      </div>

      <div>
        <span class="card-title">{{ $t('views.settings.move_server') }}</span>
        <Card class="cui-card">
          <template #content>
            <div class="flex flex-col gap-6">
              <template v-if="move && move.state !== 'offered' && move.state !== 'failed'">
                <span class="text-sm">{{ moveText }}</span>
                <ProgressBar v-if="move.transferred !== undefined" :value="moveSentPercent" />
                <Button
                  severity="secondary"
                  outlined
                  class="ml-auto cui-button-medium"
                  :label="move.state === 'sent' ? $t('components.form.button.keep_running_here') : $t('components.form.button.cancel_move')"
                  @click="confirmRunHere"
                />
              </template>

              <template v-else>
                <span class="text-sm">{{ $t('views.settings.move_server_info') }}</span>
                <span v-if="move?.state === 'failed'" class="text-xs text-muted select-text">{{ move.error }}</span>

                <div v-if="move?.state === 'offered' && moveCode" class="flex flex-col field-gap">
                  <label class="cui-label">{{ $t('restore.move_code') }}</label>
                  <InputGroup>
                    <InputText :model-value="moveCode" readonly type="text" class="font-mono" />
                    <InputGroupAddon>
                      <CuiActionButton
                        :action-text="$t('views.settings.move_code_copied')"
                        :icon="CopyIcon"
                        :button-props="{
                          severity: 'secondary',
                          text: true,
                        }"
                        @action="copyToClipboard(moveCode)"
                      />
                    </InputGroupAddon>
                  </InputGroup>
                  <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">
                    {{ $t('views.settings.move_code_info') }} {{ $t('views.settings.move_code_expires', { time: moveExpiry }) }}
                  </Message>
                </div>
                <span v-else-if="move?.state === 'offered'" class="text-xs text-muted">{{ $t('views.settings.move_code_hidden', { time: moveExpiry }) }}</span>

                <div class="flex gap-2 ml-auto">
                  <Button v-if="move?.state === 'offered'" severity="secondary" text :label="$t('components.form.button.withdraw')" @click="withdrawMove" />
                  <Button
                    :loading="moveBusy"
                    :disabled="isRestoreActive"
                    class="cui-button-medium"
                    :label="move?.state === 'offered' ? $t('components.form.button.new_move_code') : $t('components.form.button.create_move_code')"
                    @click="createMoveCode"
                  />
                </div>
              </template>
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
              <CuiUploadFiles ref="filesRef" accept=".cuibackup, application/gzip, .tar, .tar.gz" @files-uploaded="(files: File[]) => (uploadedFiles = files)" />
              <Button
                :disabled="!uploadedFiles.length || isRestoreActive"
                class="ml-auto cui-button-medium"
                :label="$t('components.form.button.restore_backup_archive')"
                @click="restoreUploaded"
              />
              <span class="text-sm border-t-[1px] border-color pt-6">{{ $t('views.settings.restore_from_server') }}</span>
              <CuiMoveCodeForm :offers-code="move?.state === 'offered'" />
            </div>
          </template>
        </Card>
      </div>

      <div v-if="lastRestore || previousState">
        <span class="card-title">{{ $t('views.settings.last_restore') }}</span>
        <Card class="cui-card">
          <template #content>
            <div class="flex flex-col gap-6">
              <div v-if="lastRestore" class="flex items-center gap-4">
                <div class="flex flex-col gap-1 min-w-0">
                  <span class="text-sm">{{ lastRestoreText }}</span>
                  <span class="text-xs text-muted">{{ new Date(lastRestore.finishedAt ?? lastRestore.updatedAt).toLocaleString() }}</span>
                  <span v-if="lastRestore.error" class="text-xs text-muted select-text">{{ lastRestore.error }}</span>
                </div>

                <div v-if="lastRestore.state === 'ready'" class="flex gap-2 ml-auto shrink-0">
                  <Button severity="secondary" text :disabled="isRestoreActive" :label="$t('components.form.button.discard')" @click="discardStaged" />
                  <Button
                    severity="secondary"
                    outlined
                    :disabled="isRestoreActive"
                    :label="$t('components.form.button.review')"
                    @click="backupRestore.showStaged(lastRestore)"
                  />
                </div>
              </div>

              <div v-if="missingPlugins.length" class="flex flex-col gap-2">
                <span class="text-sm font-semibold border-b-[1px] border-color pb-2">{{ $t('views.settings.restore_missing_plugins') }}</span>

                <div v-for="plugin in missingPlugins" :key="plugin.name" class="flex items-center gap-3 py-1 min-w-0">
                  <div class="flex flex-col min-w-0">
                    <span class="text-sm truncate">{{ plugin.name }}@{{ plugin.version }}</span>
                    <span v-if="plugin.error" class="text-xs text-muted truncate select-text">{{ plugin.error }}</span>
                  </div>

                  <div class="flex gap-1 ml-auto shrink-0">
                    <Button
                      v-tooltip.top="{ value: $t('components.form.button.retry') }"
                      text
                      rounded
                      severity="secondary"
                      class="cui-icon-md"
                      :loading="pluginBusy === plugin.name"
                      :disabled="!!pluginBusy"
                      @click="retryPlugin(plugin.name)"
                    >
                      <template #icon>
                        <i-mdi:refresh width="100%" height="100%" />
                      </template>
                    </Button>
                    <Button
                      v-tooltip.top="{ value: $t('components.form.button.discard') }"
                      text
                      rounded
                      severity="danger"
                      class="cui-icon-md"
                      :disabled="!!pluginBusy"
                      @click="discardPlugin(plugin.name)"
                    >
                      <template #icon>
                        <i-mdi:trash-can-outline width="100%" height="100%" />
                      </template>
                    </Button>
                  </div>
                </div>
              </div>

              <div v-if="previousState" class="flex items-center gap-4">
                <span class="text-sm">{{ $t('views.settings.restore_previous', { date: new Date(previousState.expiresAt).toLocaleDateString() }) }}</span>
                <Button
                  severity="secondary"
                  outlined
                  :disabled="isRestoreActive"
                  class="ml-auto shrink-0 cui-button-medium"
                  :label="$t('components.form.button.undo_restore')"
                  @click="confirmUndo"
                />
              </div>
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
              <span class="text-sm">{{ $t('views.settings.scheduled_backup_info') }}</span>

              <CuiToggleRow :label="$t('components.form.label.enabled')">
                <template #hint>
                  <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint">{{
                    $t('views.settings.scheduled_backup_enabled_hint')
                  }}</Message>
                  <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint">{{ lastRunText }}</Message>
                </template>
                <ToggleSwitch v-model="schedulerForm.enabled" :disabled="schedulerSaving" />
              </CuiToggleRow>

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
                    <CuiNumberStepper
                      v-model="schedulerForm.dayOfMonth"
                      input-id="backupDayOfMonth"
                      :min="1"
                      :max="28"
                      :use-grouping="false"
                      :disabled="schedulerSaving"
                    />
                  </div>

                  <div class="flex flex-col field-gap">
                    <label for="backupRetention" class="cui-label">{{ $t('views.settings.backup_retention') }}</label>
                    <CuiNumberStepper v-model="schedulerForm.retention" input-id="backupRetention" :min="1" :max="60" :use-grouping="false" :disabled="schedulerSaving" />
                    <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('views.settings.backup_retention_hint') }}</Message>
                  </div>
                </div>

                <div class="flex flex-col field-gap">
                  <label for="backupDestination" class="cui-label">{{ $t('views.settings.backup_destination') }}</label>
                  <InputText id="backupDestination" v-model="schedulerForm.destinationPath" :placeholder="defaultDestination" :disabled="schedulerSaving" />
                  <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('views.settings.backup_destination_hint') }}</Message>
                  <Message v-if="savedDestination" severity="secondary" variant="simple" size="small" class="cui-input-hint select-text">
                    {{ $t('views.settings.backup_saved_in', { path: savedDestination }) }}
                  </Message>
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
                  :disabled="schedulerRunning || !timeValid || !schedulerDirty"
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
                    <span class="text-xs text-muted">{{ backupDetails(backup) }}</span>
                  </div>

                  <div class="flex gap-1 ml-auto shrink-0">
                    <Button
                      v-tooltip.top="{ value: $t('components.form.button.restore') }"
                      text
                      rounded
                      severity="secondary"
                      class="cui-icon-md"
                      :disabled="isRestoreActive"
                      @click="backupRestore.stageScheduled(backup.filename)"
                    >
                      <template #icon>
                        <i-mdi:backup-restore width="100%" height="100%" />
                      </template>
                    </Button>
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
import { isEqual } from '@camera.ui/common/utils';
import CopyIcon from '~icons/fluent/copy-16-filled';

import {
  backupDownloadSourceFn,
  backupJobFn,
  backupKeyFn,
  cancelMoveFn,
  cancelRestoreFn,
  confirmBackupKeyFn,
  createMoveFn,
  deleteScheduledBackupFn,
  discardRestorePluginFn,
  getBackupSchedulerFn,
  getRestoreFn,
  moveStatusFn,
  patchBackupSchedulerFn,
  retryRestorePluginFn,
  runBackupSchedulerFn,
  scheduledBackupDownloadSourceFn,
  startBackupJobFn,
} from '@/api/routes/backup.js';
import { copyToClipboard, extractErrorMessage, formatBytes, formatRelativeTime } from '@/common/utils.js';
import { readThemeStorage } from '@/stores/theme.js';

import type CuiUploadFiles from '@/components/CuiUploadFIles/CuiUploadFiles.vue';
import type {
  BackupJob,
  BackupKeyInfo,
  DBBackupSchedulerLastRun,
  DBBackupSchedulerSettings,
  MoveState,
  MoveStatus,
  RestoreOverview,
  ScheduledBackupEntry,
  UiLocalStorage,
  UserLanguage,
} from '@shared/types';

const MOVE_PENDING_STATES = new Set<MoveState>(['offered', 'preparing', 'packing', 'ready']);
const MOVE_POLL_INTERVAL_MS = 2000;
const JOB_POLL_INTERVAL_MS = 1000;
const JOB_POLL_ATTEMPTS = 10;

const dialog = useCuiDialog();
const toast = useCuiToast();
const { t, locale } = useI18n();
const backupRestore = useBackupRestore();
const { beginServerRestart } = useServerRestart();
const serverChannel = useSocket('/server');

const filesRef = useTemplateRef<InstanceType<typeof CuiUploadFiles>>('filesRef');
const uploadedFiles = shallowRef<File[]>([]);
const isLoading = ref(false);
const schedulerLoading = ref(true);
const schedulerSaving = ref(false);
const schedulerRunning = ref(false);
const downloadingBackup = ref<string | null>(null);
const scheduledBackups = ref<ScheduledBackupEntry[]>([]);
const defaultDestination = ref('');
const destination = ref('');
const lastBackupAt = ref<number>();
const job = ref<BackupJob | null>(null);
const backupKey = ref<BackupKeyInfo | null>(null);
const lastRun = ref<DBBackupSchedulerLastRun>();
const restoreOverview = ref<RestoreOverview>();
const pluginBusy = ref<string | null>(null);
const move = ref<MoveStatus | null>(null);
const moveCode = ref('');
const moveBusy = ref(false);
let movePollTimer: ReturnType<typeof setTimeout> | undefined;
const schedulerForm = reactive<Omit<DBBackupSchedulerSettings, 'lastRun'>>({
  enabled: false,
  interval: 'daily',
  time: '03:00',
  weekday: 0,
  dayOfMonth: 1,
  retention: 7,
  destinationPath: '',
});

const savedScheduler = ref<Omit<DBBackupSchedulerSettings, 'lastRun'>>();

const timeValid = computed(() => /^([01]\d|2[0-3]):[0-5]\d$/.test(schedulerForm.time));
const schedulerDirty = computed(() => !!savedScheduler.value && !isEqual({ ...schedulerForm }, savedScheduler.value));

const jobPercent = computed(() => (job.value?.phase === 'packing' && job.value.total ? Math.round((job.value.done / job.value.total) * 100) : null));

const jobText = computed(() => (job.value?.phase === 'packing' ? t('views.settings.backup_job_packing') : t('views.settings.backup_job_snapshot')));

const lastBackupText = computed(
  () => `${t('views.settings.backup_last')}: ${lastBackupAt.value ? formatRelativeTime(lastBackupAt.value) : t('views.settings.backup_last_never')}`,
);

const savedDestination = computed(() => (destination.value && destination.value !== defaultDestination.value ? destination.value : ''));

const intervalOptions = computed(() => (['daily', 'weekly', 'monthly'] as const).map((value) => ({ label: t(`views.settings.backup_interval_${value}`), value })));

const weekdayOptions = computed(() =>
  Array.from({ length: 7 }, (_, i) => ({
    label: new Intl.DateTimeFormat(locale.value, { weekday: 'long' }).format(new Date(Date.UTC(2024, 0, 7 + i, 12))),
    value: i,
  })),
);

const lastRestore = computed(() => {
  const status = restoreOverview.value?.status;
  return status && status.state !== 'cancelled' && status.state !== 'expired' ? status : null;
});

const previousState = computed(() => restoreOverview.value?.previous ?? null);

const missingPlugins = computed(() =>
  lastRestore.value && lastRestore.value.state !== 'ready' ? lastRestore.value.plugins.filter((plugin) => plugin.state === 'failed' || plugin.state === 'pending') : [],
);

const lastRestoreText = computed(() => {
  switch (lastRestore.value?.state) {
    case 'ready':
      return t('views.settings.restore_waiting');
    case 'confirmed':
    case 'applied':
      return t('views.settings.restore_running');
    case 'done':
      return lastRestore.value.kind === 'undo' ? t('restore.result_undone') : t('restore.result_done');
    case 'done-with-problems':
      return t('restore.result_problems');
    case 'failed':
      return t('restore.result_failed');
    case 'rolled-back':
      return t('restore.result_rolled_back');
    default:
      return '';
  }
});

const moveExpiry = computed(() => (move.value ? new Date(move.value.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''));

const moveSentPercent = computed(() => (move.value?.size && move.value.transferred !== undefined ? Math.round((move.value.transferred / move.value.size) * 100) : 0));

const moveText = computed(() => {
  const target = move.value?.target ?? '';
  if (move.value?.state === 'sent') {
    return t('views.settings.move_done', { target, date: new Date(move.value.sentAt ?? move.value.createdAt).toLocaleString() });
  }
  return t('views.settings.move_taking_over', { target });
});

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

    // a value left over from an older release must not fail the whole download
    const ui = localStorage.getItem('ui');
    if (ui) {
      try {
        uiLocalStorage.ui = JSON.parse(ui);
      } catch {
        // unreadable, back up the rest
      }
    }

    const language = localStorage.getItem('language');
    if (language) {
      uiLocalStorage.language = language as UserLanguage;
    }

    if (localStorage.getItem('theme')) {
      uiLocalStorage.theme = readThemeStorage();
    }

    const started = await startBackupJobFn(uiLocalStorage);

    if (started) {
      job.value = started;
      const finished = await waitForJob(started.id);
      if (finished.state === 'failed') throw new Error(finished.error);
      lastBackupAt.value = finished.startedAt;
      if (finished.download) {
        await download({ url: finished.download.url, filename: finished.download.filename, mimeType: 'application/octet-stream' });
      }
      askToKeepKey();
    } else {
      const timestamp = Date.now();
      const source = await backupDownloadSourceFn(uiLocalStorage);

      await download({
        filename: `cameraui-backup-${timestamp}.tar.gz`,
        mimeType: 'application/gzip',
        ...source,
      });
    }
  } catch (error: any) {
    if (job.value?.state === 'running') job.value = null;
    toast.add({ severity: 'error', detail: extractErrorMessage(error), life: 10000 });
  }

  isLoading.value = false;
}

async function waitForJob(id: string): Promise<BackupJob> {
  let failures = 0;

  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, JOB_POLL_INTERVAL_MS));

    let current: BackupJob | null;
    try {
      current = await backupJobFn();
      failures = 0;
    } catch (error) {
      if (++failures < JOB_POLL_ATTEMPTS) continue;
      throw error;
    }

    // a restart drops the job
    if (current?.id !== id) throw new Error(t('views.settings.backup_job_lost'));
    job.value = current;
    if (current.state !== 'running') return current;
  }
}

async function loadKey(): Promise<void> {
  try {
    backupKey.value = await backupKeyFn();
  } catch {
    // servers before 2.4.0 have no key
  }
}

async function confirmKey(): Promise<void> {
  try {
    backupKey.value = await confirmBackupKeyFn();
  } catch (error: any) {
    toast.add({ severity: 'error', detail: extractErrorMessage(error), life: 3000 });
  }
}

async function saveKeyFile(): Promise<void> {
  if (!backupKey.value) return;

  try {
    const text = `${t('views.settings.backup_key_file')}\n\n${backupKey.value.key}\n`;
    await download({ blob: new Blob([text], { type: 'text/plain' }), filename: 'camera.ui-backup-key.txt', mimeType: 'text/plain' });
  } catch (error: any) {
    toast.add({ severity: 'error', detail: extractErrorMessage(error), life: 3000 });
  }
}

function askToKeepKey(): void {
  if (!backupKey.value || backupKey.value.confirmedAt) return;

  dialog.openTextDialog({
    data: {
      title: t('views.settings.backup_key_dialog_title'),
      contentText: `${t('views.settings.backup_key_dialog_text')}\n\n\`${backupKey.value.key}\``,
      markdown: true,
      confirmText: t('views.settings.backup_key_dialog_confirm'),
    },
    onConfirm: confirmKey,
  });
}

function restoreUploaded(): void {
  const file = uploadedFiles.value[0];
  if (!file) return;

  filesRef.value?.reset();
  uploadedFiles.value = [];
  backupRestore.upload(file);
}

async function loadRestore(): Promise<void> {
  try {
    restoreOverview.value = await getRestoreFn();
  } catch (error: any) {
    toast.add({ severity: 'error', detail: extractErrorMessage(error), life: 3000 });
  }
}

async function discardStaged(): Promise<void> {
  try {
    await cancelRestoreFn();
  } catch (error: any) {
    toast.add({ severity: 'error', detail: extractErrorMessage(error), life: 3000 });
  }
  await loadRestore();
}

async function retryPlugin(name: string): Promise<void> {
  pluginBusy.value = name;
  try {
    await retryRestorePluginFn(name);
  } catch (error: any) {
    toast.add({ severity: 'error', detail: extractErrorMessage(error), life: 10000 });
  } finally {
    pluginBusy.value = null;
    await loadRestore();
  }
}

async function discardPlugin(name: string): Promise<void> {
  pluginBusy.value = name;
  try {
    await discardRestorePluginFn(name);
  } catch (error: any) {
    toast.add({ severity: 'error', detail: extractErrorMessage(error), life: 3000 });
  } finally {
    pluginBusy.value = null;
    await loadRestore();
  }
}

function confirmUndo(): void {
  dialog.openTextDialog({
    data: {
      title: t('components.dialog.title.confirm'),
      contentText: t('components.dialog.message.confirm_undo_restore'),
      confirmText: t('components.form.button.undo_restore'),
    },
    onConfirm: () => backupRestore.undo(),
  });
}

async function loadMove(): Promise<void> {
  clearTimeout(movePollTimer);
  try {
    move.value = await moveStatusFn();
  } catch {
    // the server restarts for the move, the next round asks again
  }

  if (move.value?.state !== 'offered') moveCode.value = '';
  if (move.value && MOVE_PENDING_STATES.has(move.value.state)) movePollTimer = setTimeout(loadMove, MOVE_POLL_INTERVAL_MS);
}

async function createMoveCode(): Promise<void> {
  moveBusy.value = true;
  try {
    const offer = await createMoveFn([location.host]);
    move.value = offer.status;
    moveCode.value = offer.code;
  } catch (error: any) {
    toast.add({ severity: 'error', detail: extractErrorMessage(error), life: 10000 });
  } finally {
    moveBusy.value = false;
  }
}

async function withdrawMove(): Promise<void> {
  try {
    const { restart } = await cancelMoveFn();
    if (restart) beginServerRestart();
  } catch (error: any) {
    toast.add({ severity: 'error', detail: extractErrorMessage(error), life: 3000 });
  }
  moveCode.value = '';
  await loadMove();
}

function confirmRunHere(): void {
  const sent = move.value?.state === 'sent';
  dialog.openTextDialog({
    data: {
      title: t('components.dialog.title.confirm'),
      contentText: sent ? t('components.dialog.message.confirm_keep_running_here') : t('components.dialog.message.confirm_cancel_move'),
      confirmText: sent ? t('components.form.button.keep_running_here') : t('components.form.button.cancel_move'),
    },
    onConfirm: withdrawMove,
  });
}

function backupDetails(backup: ScheduledBackupEntry): string {
  const details = [new Date(backup.timestamp).toLocaleString(), formatBytes(backup.size)];
  if (backup.encrypted) details.push(backup.ownKey === false ? t('views.settings.backup_foreign_key') : t('views.settings.backup_encrypted'));
  return details.join(' · ');
}

async function loadScheduler(): Promise<void> {
  try {
    const state = await getBackupSchedulerFn();
    const { lastRun: storedLastRun, ...settings } = state.settings;
    Object.assign(schedulerForm, settings);
    savedScheduler.value = { ...settings };
    lastRun.value = storedLastRun;
    scheduledBackups.value = state.backups;
    defaultDestination.value = state.defaultDestination;
    destination.value = state.destination ?? '';
    lastBackupAt.value = state.lastBackupAt;
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
    await loadScheduler();
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
    const source = await scheduledBackupDownloadSourceFn(backup.filename);
    await download({ filename: backup.filename, mimeType: backup.encrypted ? 'application/octet-stream' : 'application/gzip', ...source });
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

async function loadJob(): Promise<void> {
  try {
    const current = await backupJobFn();
    if (current?.source !== 'move') job.value = current;
  } catch {
    // the progress shows with the next socket update
  }
}

serverChannel.on<BackupJob>('backup-job', (payload) => {
  if (payload.source === 'move') return;
  job.value = payload;
  if (payload.state === 'done') lastBackupAt.value = payload.startedAt;
  if (payload.source === 'schedule' && payload.state !== 'running') loadScheduler();
});

watch(isRestoreActive, (active) => {
  if (!active) loadRestore();
});

onMounted(() => {
  loadScheduler();
  loadRestore();
  loadMove();
  loadKey();
  loadJob();
});

onBeforeUnmount(() => clearTimeout(movePollTimer));
</script>

<style scoped></style>
