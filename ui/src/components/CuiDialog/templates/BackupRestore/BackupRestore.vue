<template>
  <div class="flex flex-col gap-6 text-sm pt-1 pb-2">
    <template v-if="phase === 'ready'">
      <dl v-if="summary" class="backup-restore__facts grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2">
        <template v-if="summary.createdAt">
          <dt class="text-muted">{{ $t('restore.summary_created') }}</dt>
          <dd>{{ new Date(summary.createdAt).toLocaleString() }}</dd>
        </template>
        <dt class="text-muted">{{ $t('restore.summary_system') }}</dt>
        <dd>{{ $t('restore.summary_version', { version: summary.version, platform: humanizeOs(summary.platform ?? '') }) }}</dd>
        <dt class="text-muted">{{ $t('restore.summary_cameras') }}</dt>
        <dd>{{ summary.cameras }}</dd>
        <dt class="text-muted">{{ $t('restore.summary_plugins') }}</dt>
        <dd>{{ plugins.length }}</dd>
        <template v-if="summary.accounts.length">
          <dt class="text-muted">{{ $t('restore.summary_accounts') }}</dt>
          <dd class="font-semibold select-text break-words">{{ summary.accounts.map((account) => account.username).join(', ') }}</dd>
        </template>
      </dl>

      <div v-if="summary?.suggestedMode" class="flex flex-col gap-3">
        <span id="restoreModeLabel" class="cui-label">{{ $t('restore.mode_title') }}</span>
        <div class="grid sm:grid-cols-2 gap-2" role="radiogroup" aria-labelledby="restoreModeLabel">
          <button
            v-for="option in RESTORE_MODES"
            :key="option"
            type="button"
            role="radio"
            :aria-checked="mode === option"
            class="backup-restore__mode"
            :class="{ 'backup-restore__mode--active': mode === option }"
            @click="mode = option"
          >
            <span class="font-semibold">
              {{ $t(`restore.mode_${option}`) }}
              <span v-if="summary.suggestedMode === option" class="text-xs font-normal text-muted">{{ $t('restore.mode_suggested') }}</span>
            </span>
            <span class="text-xs text-muted">{{ $t(`restore.mode_${option}_hint`) }}</span>
          </button>
        </div>
        <Message v-for="warning in modeWarnings" :key="warning" severity="warn" variant="simple" size="small">{{ warning }}</Message>
        <span v-for="hint in modeHints" :key="hint" class="text-xs text-muted">{{ hint }}</span>
      </div>

      <div v-if="notes.length" class="flex flex-col gap-3">
        <span class="cui-label">{{ $t('restore.summary_notes') }}</span>
        <div v-for="note in notes" :key="note.key" class="flex flex-col gap-0.5 min-w-0">
          <span class="font-medium break-all select-text">{{ note.label }}</span>
          <span v-for="(line, index) in note.lines" :key="index" class="text-xs text-muted select-text break-words">{{ line }}</span>
        </div>
      </div>

      <span class="text-xs text-muted">{{ $t('restore.summary_replace') }}</span>
    </template>

    <template v-else-if="phase === 'key'">
      <span>{{ keyProblem === 'backup-key-wrong' ? $t('restore.key_wrong') : $t('restore.key_required') }}</span>
      <div class="flex flex-col field-gap">
        <label for="restoreBackupKey" class="cui-label">{{ $t('restore.key_label') }}</label>
        <InputText
          id="restoreBackupKey"
          v-model="backupKey"
          class="font-mono"
          autocomplete="off"
          spellcheck="false"
          :invalid="keyProblem === 'backup-key-wrong'"
          @keyup.enter="openWithKey"
        />
        <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('restore.key_hint') }}</Message>
      </div>
      <input ref="keyFileRef" type="file" accept=".txt,text/plain" class="hidden" @change="readKeyFile" />
      <Button severity="secondary" text size="small" class="self-start" :label="$t('restore.key_file')" @click="keyFileRef?.click()" />
    </template>

    <div v-else class="flex flex-col items-center gap-4 py-4 my-auto text-center">
      <InlineSvg :src="getImageUrl('logo_animated.svg')" width="52px" height="58px" title="camera.ui" aria-label="camera.ui" />

      <template v-if="phase === 'finished'">
        <span>{{ resultText }}</span>
        <span v-if="status?.error" class="text-xs text-muted select-text">{{ status.error }}</span>
        <template v-if="succeeded && summary?.cloud">
          <span class="text-xs text-muted">{{ $t('restore.result_cloud') }}</span>
          <span v-if="status?.kind === 'undo' || plugins.some((plugin) => plugin.name === NVR_PLUGIN_NAME)" class="text-xs text-muted">{{
            $t('restore.result_nvr')
          }}</span>
        </template>

        <div v-if="failedPlugins.length" class="flex flex-col gap-1 w-full text-left">
          <span v-for="plugin in failedPlugins" :key="plugin.name" class="text-xs select-text">
            <span class="font-semibold">{{ plugin.name }}</span>
            <span v-if="plugin.error" class="text-muted">: {{ plugin.error }}</span>
          </span>
          <span class="text-xs text-muted">{{ $t('restore.result_problems_hint') }}</span>
        </div>
      </template>

      <template v-else>
        <span class="text-muted">{{ phaseText }}</span>
        <span v-if="phase === 'moving' && pull?.source" class="text-xs text-muted select-text">{{ $t('restore.move_from', { source: pull.source }) }}</span>

        <ProgressBar v-if="phase === 'uploading'" :value="uploadPercent" class="w-full" />
        <ProgressBar v-else-if="phase === 'moving' && pull?.state === 'receiving'" :value="movePercent" class="w-full" />
        <ProgressBar v-else mode="indeterminate" class="w-full" style="height: 6px" />

        <div v-if="status?.state === 'applied' && plugins.length" class="flex flex-col gap-1 w-full text-left">
          <div v-for="plugin in plugins" :key="plugin.name" class="flex items-center gap-2 text-xs min-w-0">
            <ProgressSpinner v-if="plugin.state === 'pending'" class="w-[14px] h-[14px] m-0 shrink-0" stroke-width="6" />
            <i-mdi:check v-else-if="plugin.state === 'installed'" class="w-[14px] h-[14px] shrink-0 text-green-500" />
            <i-mdi:alert-circle-outline v-else class="w-[14px] h-[14px] shrink-0 text-red-500" />
            <span class="truncate">{{ plugin.name }}</span>
          </div>
        </div>

        <span class="text-xs text-muted">{{ $t('restore.dont_close') }}</span>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import InlineSvg from 'vue-inline-svg';

import { NVR_PLUGIN_NAME } from '@/common/constants.js';
import { describePlatform, humanizeOs } from '@/common/platformLabels.js';
import { formatBytes, getImageUrl } from '@/common/utils.js';
import { BACKUP_KEY_PATTERN, MOVE_PHASES, RESTORE_MODES } from './types.js';

import type { DialogRefProps } from '@/composables/useCuiDialog.js';
import type { RestoreMode, RestorePluginResult } from '@shared/types';
import type { BackupRestoreNote } from './types.js';

const { t } = useI18n();
const toast = useCuiToast();
const dialogRefProps = inject<DialogRefProps>('dialogRefProps')!;
const dialogTitle = inject<Ref<string> | undefined>('dialogTitle', undefined);

const { phase, status, uploadPercent, pull, movePercent, keyProblem, cancelUpload, cancelFetch, submitKey, cancelKey, confirm, cancel, close } = useBackupRestore();

const keyFileRef = useTemplateRef<HTMLInputElement>('keyFileRef');
const backupKey = ref('');
const mode = ref<RestoreMode>('copy');

const summary = computed(() => status.value?.summary);
const plugins = computed(() => (status.value?.plugins ?? []).filter((plugin) => plugin.state !== 'discarded'));
const failedPlugins = computed(() =>
  status.value?.state === 'done-with-problems' ? plugins.value.filter((plugin) => plugin.state === 'failed' || plugin.state === 'pending') : [],
);
const succeeded = computed(() => status.value?.state === 'done' || status.value?.state === 'done-with-problems');

const modeWarnings = computed(() => {
  const current = summary.value;
  if (mode.value !== 'move' || !current) return [];

  const warnings: string[] = [];
  if (current.sourceRunning?.length) warnings.push(t('restore.move_source_running', { address: current.sourceRunning.join(', ') }));
  if (current.sourceUnchecked) {
    warnings.push(t(current.sourceUnchecked === 'local-network' ? 'restore.move_source_unchecked_local_network' : 'restore.move_source_unchecked_network'));
  }
  return warnings;
});

const modeHints = computed(() => {
  const current = summary.value;
  if (!current) return [];
  if (mode.value === 'move' && !current.certificate) return [t('restore.move_no_certificate')];
  if (mode.value === 'copy' && current.workers) return [t('restore.copy_workers', { count: current.workers })];
  return [];
});

const notes = computed<BackupRestoreNote[]>(() => {
  const current = summary.value;

  const pluginNotes = plugins.value.flatMap((plugin) => {
    const lines = pluginLines(plugin);
    return lines.length ? [{ key: `plugin:${plugin.name}`, label: plugin.name, lines }] : [];
  });
  const missing = (current?.pluginsNotInBackup ?? []).map((name) => ({ key: `missing:${name}`, label: name, lines: [t('restore.plugin_not_in_backup')] }));
  const platform = (current?.platformChanges ?? []).map((change) => ({
    key: `platform:${change.setting}`,
    label: change.setting,
    lines: [change.to === undefined ? t('restore.platform_dropped', change) : t('restore.platform_change', change)],
  }));
  // on the same server these folders stay where they are
  const folders = current?.sameServer ? [] : (current?.excluded ?? []);
  const excluded = folders.length
    ? [
        {
          key: 'excluded',
          label: t('restore.summary_excluded'),
          lines: [...folders.map((folder) => (folder.size === undefined ? folder.path : `${folder.path} (${formatBytes(folder.size)})`)), t('restore.excluded_hint')],
        },
      ]
    : [];

  return [...pluginNotes, ...missing, ...platform, ...excluded];
});

const title = computed(() => {
  if (phase.value === 'key') return t('restore.title_key');
  if (status.value?.kind === 'undo') return t('restore.title_undo');
  if (phase.value === 'moving') return t('restore.title_move');
  if (phase.value === 'ready') return t('restore.title_ready');
  return t('restore.title');
});

const buttons = computed<{ cancel?: string; confirm?: string; disabled?: boolean }>(() => {
  const cancelText = t('components.form.button.cancel');

  switch (phase.value) {
    case 'ready':
      return { cancel: cancelText, confirm: t('restore.confirm') };
    case 'key':
      return { cancel: cancelText, confirm: t('restore.key_open'), disabled: !backupKey.value.trim() };
    case 'uploading':
    case 'moving':
      return { cancel: cancelText };
    case 'finished':
      return { confirm: succeeded.value ? t('restore.to_login') : t('components.form.button.close') };
    default:
      return {};
  }
});

const phaseText = computed(() => {
  if (phase.value === 'uploading') return t('restore.phase_uploading');
  if (phase.value === 'moving') return t(`restore.phase_move_${MOVE_PHASES.has(pull.value?.state ?? '') ? pull.value!.state : 'connecting'}`);
  if (phase.value === 'checking') return t('restore.phase_checking');

  switch (status.value?.state) {
    case 'confirmed':
      return t('restore.phase_restarting');
    case 'applied':
      return plugins.value.some((plugin) => plugin.state === 'pending') ? t('restore.phase_plugins') : t('restore.phase_starting');
    default:
      return t('restore.phase_restoring');
  }
});

const resultText = computed(() => {
  switch (status.value?.state) {
    case 'done':
      return status.value.kind === 'undo' ? t('restore.result_undone') : t('restore.result_done');
    case 'done-with-problems':
      return t('restore.result_problems');
    case 'failed':
      return t('restore.result_failed');
    case 'rolled-back':
      return t('restore.result_rolled_back');
    default:
      return t('restore.result_unknown');
  }
});

function pluginLines(plugin: RestorePluginResult): string[] {
  if (plugin.note === 'unavailable') return [t('restore.plugin_unavailable', { reason: pluginReason(plugin) })];

  const lines: string[] = [];
  if (plugin.installVersion) lines.push(t('restore.plugin_version', { version: plugin.installVersion, saved: plugin.version }));
  if (plugin.worker && mode.value === 'move') {
    lines.push(t('restore.plugin_worker', { worker: plugin.worker }));
    return lines;
  }
  if (plugin.worker) lines.push(t('restore.plugin_worker_copy', { worker: plugin.worker }));
  if (plugin.note === 'platform') lines.push(t('restore.plugin_platform', { reason: pluginReason(plugin) }));
  return lines;
}

function pluginReason({ issue, note, reason }: RestorePluginResult): string {
  if (!issue) return reason ?? '';
  const text =
    issue.code === 'platform'
      ? t('restore.plugin_issue.platform', { platform: describePlatform(issue.os, issue.cpu, issue.libc) })
      : t(`restore.plugin_issue.${issue.code.replaceAll('-', '_')}`, issue);
  return note === 'unavailable' && issue.code !== 'not-in-registry' ? `${text} ${t('restore.plugin_issue.no_other_version')}` : text;
}

async function openWithKey(): Promise<void> {
  if (backupKey.value.trim()) await submitKey(backupKey.value.trim());
}

async function readKeyFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;

  const match = (await file.text()).match(BACKUP_KEY_PATTERN);
  if (!match) {
    toast.add({ severity: 'error', detail: t('restore.key_file_invalid'), life: 5000 });
    return;
  }
  backupKey.value = match[0].toUpperCase();
  await openWithKey();
}

async function onConfirm(): Promise<null> {
  if (phase.value === 'ready') await confirm(mode.value);
  else if (phase.value === 'key') await openWithKey();
  else if (phase.value === 'finished') await close();
  return null;
}

async function onCancel(): Promise<null> {
  if (phase.value === 'ready') await cancel();
  else if (phase.value === 'key') await cancelKey();
  else if (phase.value === 'uploading') cancelUpload();
  else if (phase.value === 'moving') await cancelFetch();
  return null;
}

watch(
  title,
  (current) => {
    if (dialogTitle) dialogTitle.value = current;
  },
  { immediate: true },
);

watch(
  buttons,
  (current) => {
    dialogRefProps.cancelText.value = current.cancel;
    dialogRefProps.hideCancelButton.value = !current.cancel;
    dialogRefProps.confirmText.value = current.confirm;
    dialogRefProps.hideConfirmButton.value = !current.confirm;
    dialogRefProps.disabled.value = !!current.disabled;
  },
  { immediate: true },
);

watch(
  () => summary.value?.suggestedMode,
  (suggested) => {
    if (suggested) mode.value = suggested;
  },
  { immediate: true },
);

defineExpose({
  onConfirm,
  onCancel,
});
</script>

<style scoped>
.backup-restore__facts {
  padding: 0.75rem 1rem;
  border: 1px solid var(--border-color);
  border-radius: 0.5rem;
}

.backup-restore__mode {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 0.5rem;
  text-align: left;
  cursor: pointer;
}

.backup-restore__mode--active {
  border-color: var(--p-primary-color);
  box-shadow: 0 0 0 1px var(--p-primary-color);
}
</style>
