<template>
  <div>
    <div class="flex flex-col w-full gap-6">
      <div>
        <span class="card-title">{{ $t('views.settings.notifications.general') }}</span>
        <Card class="cui-card">
          <template #content>
            <div class="flex flex-col gap-6">
              <span class="text-sm">{{ $t('views.settings.notifications.general_info') }}</span>

              <div v-if="settingsLoading && !draft" class="flex items-center justify-center py-8">
                <ProgressSpinner class="w-[30px] h-[30px] m-0" stroke-width="5" />
              </div>

              <template v-else-if="draft">
                <div class="flex items-center gap-4">
                  <div class="flex flex-col field-switch-gap">
                    <label class="cui-label-switch">{{ $t('views.settings.notifications.enable') }}</label>
                    <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint">
                      {{ $t('views.settings.notifications.enable_info') }}
                    </Message>
                  </div>
                  <ToggleSwitch :model-value="draft.enabled" :loading="enabling" class="ml-auto shrink-0" @update:model-value="onToggleEnabled" />
                </div>

                <div v-if="isCapacitor && draft.enabled" class="flex items-center gap-4">
                  <div class="flex flex-col field-switch-gap min-w-0">
                    <label class="cui-label-switch">{{ $t('views.settings.notifications.this_device') }}</label>
                    <Message :severity="deviceSynced ? 'secondary' : 'warn'" variant="simple" size="small" class="cui-input-switch-hint">
                      {{ deviceSynced ? $t('views.settings.notifications.this_device_synced') : $t('views.settings.notifications.this_device_unsynced') }}
                    </Message>
                  </div>
                  <Button
                    :severity="deviceSynced ? 'secondary' : undefined"
                    :loading="syncing"
                    class="cui-button-small ml-auto shrink-0"
                    :label="deviceSynced ? $t('views.settings.notifications.resync') : $t('views.settings.notifications.sync')"
                    @click="onSyncDevice"
                  />
                </div>

                <div v-else-if="isElectronApp && draft.enabled" class="flex items-center gap-4">
                  <div class="flex flex-col field-switch-gap min-w-0">
                    <label class="cui-label-switch">{{ $t('views.settings.notifications.this_device') }}</label>
                    <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint">
                      {{ $t('views.settings.notifications.this_device_desktop') }}
                    </Message>
                  </div>
                  <ToggleSwitch :model-value="desktopEnabled" :loading="desktopLoading" class="ml-auto shrink-0" @update:model-value="onToggleDesktop" />
                </div>

                <div v-if="draft.enabled" class="flex flex-col gap-2">
                  <div class="flex items-center gap-4">
                    <div class="flex flex-col field-switch-gap">
                      <label class="cui-label-switch">{{ $t('views.settings.notifications.quiet_hours') }}</label>
                      <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint">
                        {{ $t('views.settings.notifications.quiet_hours_info') }}
                      </Message>
                    </div>
                    <ToggleSwitch :model-value="!!draft.quietHours" class="ml-auto shrink-0" @update:model-value="toggleQuietHours" />
                  </div>

                  <div v-if="draft.quietHours" class="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
                    <div class="flex flex-col field-gap">
                      <label for="qh-from" class="cui-label">{{ $t('views.settings.notifications.from') }}</label>
                      <DatePicker
                        input-id="qh-from"
                        :model-value="quietHoursFrom"
                        time-only
                        show-icon
                        icon-display="input"
                        class="w-full"
                        @update:model-value="(v) => setQuietHoursTime('from', v as Date | null)"
                      />
                    </div>
                    <div class="flex flex-col field-gap">
                      <label for="qh-to" class="cui-label">{{ $t('views.settings.notifications.to') }}</label>
                      <DatePicker
                        input-id="qh-to"
                        :model-value="quietHoursTo"
                        time-only
                        show-icon
                        icon-display="input"
                        class="w-full"
                        @update:model-value="(v) => setQuietHoursTime('to', v as Date | null)"
                      />
                    </div>
                    <div class="flex flex-col field-gap">
                      <label for="qh-tz" class="cui-label">{{ $t('views.settings.notifications.timezone') }}</label>
                      <InputText id="qh-tz" v-model="draft.quietHours.timezone" :placeholder="browserTz" />
                    </div>
                  </div>
                </div>
              </template>
            </div>
          </template>
        </Card>
      </div>

      <div v-if="showRest && isAdmin">
        <span class="card-title">{{ $t('views.settings.notifications.system_notifications') }}</span>
        <Card class="cui-card">
          <template #content>
            <div class="flex flex-col gap-6">
              <span class="text-sm">{{ $t('views.settings.notifications.system_notifications_info') }}</span>

              <div v-if="sourcesLoading && !sources" class="flex items-center justify-center py-8">
                <ProgressSpinner class="w-[30px] h-[30px] m-0" stroke-width="5" />
              </div>

              <div v-else-if="!sources?.system?.length" class="text-sm text-muted text-center py-8">
                {{ $t('views.settings.notifications.no_system_types') }}
              </div>

              <div v-else class="flex flex-col gap-3">
                <div v-for="(info, index) in sources.system" :key="info.type">
                  <div class="flex items-center gap-4">
                    <div class="flex flex-col field-switch-gap">
                      <label class="cui-label-switch">{{ systemLabel(info) }}</label>
                      <Message v-if="info.description" severity="secondary" variant="simple" size="small" class="cui-input-switch-hint">
                        {{ info.description }}
                      </Message>
                    </div>
                    <ToggleSwitch
                      :model-value="isSystemTypeEnabled(info.type)"
                      class="ml-auto shrink-0"
                      @update:model-value="(v) => setSystemTypeEnabled(info.type, v as boolean)"
                    />
                  </div>
                  <Divider v-if="index < sources.system.length - 1" class="my-2" />
                </div>
              </div>
            </div>
          </template>
        </Card>
      </div>

      <div v-if="showRest">
        <span class="card-title">{{ $t('views.settings.notifications.plugin_notifications') }}</span>
        <Card class="cui-card">
          <template #content>
            <div class="flex flex-col gap-6">
              <span class="text-sm">{{ $t('views.settings.notifications.plugin_notifications_info') }}</span>

              <div v-if="sourcesLoading && !sources" class="flex items-center justify-center py-8">
                <ProgressSpinner class="w-[30px] h-[30px] m-0" stroke-width="5" />
              </div>

              <div v-else-if="!sources?.plugins?.length" class="text-sm text-muted text-center py-8">
                {{ $t('views.settings.notifications.no_plugin_sources') }}
              </div>

              <div v-else class="flex flex-col gap-3">
                <div v-for="(plugin, index) in sources.plugins" :key="plugin.id">
                  <div class="flex items-center gap-4">
                    <div class="flex flex-col field-switch-gap">
                      <label class="cui-label-switch">{{ plugin.name }}</label>
                    </div>
                    <ToggleSwitch
                      :model-value="isPluginSourceEnabled(plugin.id)"
                      class="ml-auto shrink-0"
                      @update:model-value="(v) => setPluginSourceEnabled(plugin.id, v as boolean)"
                    />
                  </div>
                  <Divider v-if="index < sources.plugins.length - 1" class="my-2" />
                </div>
              </div>
            </div>
          </template>
        </Card>
      </div>

      <div v-if="showRest">
        <span class="card-title">{{ $t('views.settings.notifications.devices') }}</span>
        <Card class="cui-card">
          <template #content>
            <div class="flex flex-col gap-6">
              <span class="text-sm">{{ $t('views.settings.notifications.devices_info') }}</span>

              <div v-if="devicesLoading && !devices" class="flex items-center justify-center py-8">
                <ProgressSpinner class="w-[30px] h-[30px] m-0" stroke-width="5" />
              </div>

              <div v-else-if="!devices?.length" class="text-sm text-muted text-center py-8">
                {{ $t('views.settings.notifications.no_devices') }}
              </div>

              <CuiDataTable v-else :value="devices" striped-rows>
                <Column field="name" :header="$t('views.settings.notifications.col_name')">
                  <template #body="{ data }">
                    <InputText
                      :model-value="renameDrafts[data.id] ?? data.name"
                      :disabled="patchingId === data.id"
                      class="w-full max-w-xs min-w-[150px]"
                      @update:model-value="(v) => (renameDrafts[data.id] = v ?? '')"
                      @blur="commitRename(data)"
                      @keyup.enter="commitRename(data)"
                    />
                  </template>
                </Column>
                <Column field="pluginName" :header="$t('views.settings.notifications.col_plugin')">
                  <template #body="{ data }">
                    <Chip :label="data.pluginName" class="text-xs" />
                  </template>
                </Column>
                <Column field="active" :header="$t('views.settings.notifications.col_active')" style="width: 7rem">
                  <template #body="{ data }">
                    <ToggleSwitch :model-value="data.active" :loading="patchingId === data.id" @update:model-value="(next) => onToggleActive(data.id, next as boolean)" />
                  </template>
                </Column>
                <Column field="actions" :header="''" style="width: 6rem">
                  <template #body="{ data }">
                    <Button
                      v-tooltip="{ value: $t('views.settings.notifications.revoke') }"
                      severity="danger"
                      text
                      rounded
                      class="cui-icon-md"
                      :loading="revokingId === data.id"
                      @click="onRevoke(data.id)"
                    >
                      <template #icon>
                        <i-mdi:delete width="100%" height="100%" />
                      </template>
                    </Button>
                  </template>
                </Column>
              </CuiDataTable>
            </div>
          </template>
        </Card>
      </div>

      <div v-if="draft && isDirty" class="flex justify-end gap-2">
        <Button severity="secondary" outlined class="cui-button-medium" :disabled="isSaving" :label="$t('views.settings.notifications.reset')" @click="resetDraft" />
        <Button severity="success" class="cui-button-medium" :loading="isSaving" :label="$t('views.settings.notifications.save')" @click="onSave" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { NotificationsQuery } from '@/api/routes/notifications.js';
import { getCurrentServerId, isCapacitor } from '@/connection/index.js';

import type { DBNotificationSettings, NotifierDeviceWithSource, SystemNotificationType } from '@shared/types';

const notificationsQuery = new NotificationsQuery();

const { t, te } = useI18n();
const toast = useCuiToast();
const isAdmin = hasPermission(undefined, 'admin');
const { registerForPush, forgetIfThisDevice, isServerSynced } = usePushRegistration();
const { isElectronApp, electron } = useElectron();

const { data: settings, isLoading: settingsLoading } = notificationsQuery.getSettingsQuery();
const { data: devices, isLoading: devicesLoading } = notificationsQuery.listDevicesQuery(() => true);
const { data: sources, isLoading: sourcesLoading } = notificationsQuery.listSourcesQuery();
const { mutate: saveSettings, isPending: saveSettingsLoading } = notificationsQuery.setSettingsQuery();
const { mutateAsync: saveSettingsSilent } = notificationsQuery.setSettingsQuerySilent();
const { mutate: revokeDevice } = notificationsQuery.revokeDeviceQuery();
const { mutate: updateDevice } = notificationsQuery.updateDeviceQuery();

const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

const draft = ref<DBNotificationSettings | null>(null);
const original = ref('');
const enabling = ref(false);
const deviceSynced = ref(false);
const syncing = ref(false);
const desktopEnabled = ref(true);
const desktopLoading = ref(false);
const revokingId = ref<string | null>(null);
const renameDrafts = reactive<Record<string, string>>({});
const patchingId = ref<string | null>(null);

const isDirty = computed(() => !!draft.value && JSON.stringify(draft.value) !== original.value);
const showRest = computed(() => !!draft.value?.enabled);
const isSaving = computed(() => saveSettingsLoading.value);
const quietHoursFrom = computed(() => parseTime(draft.value?.quietHours?.from));
const quietHoursTo = computed(() => parseTime(draft.value?.quietHours?.to));

function syncDraft(incoming?: DBNotificationSettings) {
  if (!incoming) return;
  draft.value = JSON.parse(JSON.stringify(incoming));
  original.value = JSON.stringify(incoming);
}

function resetDraft() {
  syncDraft(settings.value);
}

function toggleQuietHours(enabled: boolean) {
  if (!draft.value) return;
  if (enabled) {
    draft.value.quietHours = { from: '22:00', to: '07:00', timezone: browserTz };
  } else {
    delete draft.value.quietHours;
  }
}

function parseTime(value: string | undefined): Date | null {
  if (!value) return null;
  const [h, m] = value.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

function formatTime(d: Date | null): string {
  if (!d) return '00:00';
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function setQuietHoursTime(field: 'from' | 'to', value: Date | null) {
  if (!draft.value?.quietHours) return;
  draft.value.quietHours[field] = formatTime(value);
}

function isSystemTypeEnabled(type: string): boolean {
  return draft.value?.systemTypes?.[type] !== false;
}

function setSystemTypeEnabled(type: string, enabled: boolean) {
  if (!draft.value) return;
  if (!draft.value.systemTypes) draft.value.systemTypes = {};
  if (enabled) {
    delete draft.value.systemTypes[type];
  } else {
    draft.value.systemTypes[type] = false;
  }
}

function isPluginSourceEnabled(pluginId: string): boolean {
  return draft.value?.sources?.[pluginId] !== false;
}

function setPluginSourceEnabled(pluginId: string, enabled: boolean) {
  if (!draft.value) return;
  if (!draft.value.sources) draft.value.sources = {};
  if (enabled) {
    delete draft.value.sources[pluginId];
  } else {
    draft.value.sources[pluginId] = false;
  }
}

function systemLabel(info: SystemNotificationType): string {
  const key = `views.settings.notifications.system_types.${info.type.replaceAll('.', '_')}`;
  return te(key) ? t(key) : info.label;
}

function onSave() {
  if (!draft.value) return;
  saveSettings({ settings: draft.value }, { onSuccess: (saved) => syncDraft(saved) });
}

async function onToggleEnabled(next: boolean) {
  if (!draft.value || !settings.value) return;
  enabling.value = true;
  try {
    const saved = await saveSettingsSilent({ settings: { ...settings.value, enabled: next } });
    syncDraft(saved);
  } catch (err: any) {
    toast.add({ severity: 'error', detail: err, life: 3000 });
  } finally {
    enabling.value = false;
  }
}

async function refreshDeviceSync() {
  const serverId = getCurrentServerId();
  deviceSynced.value = serverId ? await isServerSynced(serverId) : false;
}

async function refreshDesktopEnabled() {
  if (!isElectronApp || !electron) return;
  try {
    desktopEnabled.value = await electron.invoke('get-desktop-notifications');
  } catch {
    // keep the optimistic default
  }
}

async function onToggleDesktop(next: boolean) {
  if (!electron) return;
  desktopLoading.value = true;
  try {
    desktopEnabled.value = await electron.invoke('set-desktop-notifications', next);
  } catch (err: any) {
    toast.add({ severity: 'error', detail: err, life: 3000 });
  } finally {
    desktopLoading.value = false;
  }
}

async function onSyncDevice() {
  syncing.value = true;
  try {
    await registerForPush();
    await refreshDeviceSync();
    await notificationsQuery.queryClient.invalidateQueries({ queryKey: ['notifications', 'devices'] });
  } catch (err: any) {
    toast.add({ severity: 'error', detail: err, life: 3000 });
  } finally {
    syncing.value = false;
  }
}

function onRevoke(deviceId: string) {
  revokingId.value = deviceId;
  const serverId = getCurrentServerId();
  revokeDevice(
    { deviceId },
    {
      onSuccess: async () => {
        if (serverId) await forgetIfThisDevice(serverId, deviceId);
        refreshDeviceSync();
      },
      onSettled: () => (revokingId.value = null),
    },
  );
}

function commitRename(device: NotifierDeviceWithSource) {
  const next = renameDrafts[device.id];
  if (next == null) return;
  const trimmed = next.trim();
  if (!trimmed || trimmed === device.name) {
    delete renameDrafts[device.id];
    return;
  }
  patchingId.value = device.id;
  updateDevice(
    { deviceId: device.id, patch: { name: trimmed } },
    {
      onSuccess: () => delete renameDrafts[device.id],
      onSettled: () => (patchingId.value = null),
    },
  );
}

function onToggleActive(deviceId: string, active: boolean) {
  patchingId.value = deviceId;
  updateDevice({ deviceId, patch: { active } }, { onSettled: () => (patchingId.value = null) });
}

watch(settings, syncDraft, { immediate: true });

onMounted(() => {
  if (isCapacitor) refreshDeviceSync();
  if (isElectronApp) refreshDesktopEnabled();
});
</script>

<style scoped></style>
