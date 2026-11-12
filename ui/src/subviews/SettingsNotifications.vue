<template>
  <div>
    <div class="flex flex-col w-full gap-6">
      <div>
        <span class="card-title">{{ $t('views.settings.notifications.general') }}</span>
        <Card class="cui-card">
          <template #content>
            <div class="flex flex-col gap-6">
              <span class="text-sm">{{ $t('views.settings.notifications.general_info') }}</span>

              <Message v-if="permissionStates.notifications === 'denied'" severity="warn" size="small">
                {{ $t('views.settings.notifications.os_permission_denied') }}
                <RouterLink to="/settings/permissions" class="underline">{{ $t('views.settings.notifications.os_permission_link') }}</RouterLink>
              </Message>

              <div v-if="settingsLoading && !draft" class="flex items-center justify-center py-8">
                <ProgressSpinner class="w-[30px] h-[30px] m-0" stroke-width="5" />
              </div>

              <div v-else-if="draft" class="flex flex-col gap-2">
                <CuiToggleRow :label="$t('views.settings.notifications.enable')" :hint="$t('views.settings.notifications.enable_info')">
                  <ToggleSwitch :model-value="draft.enabled" :loading="enabling" @update:model-value="onToggleEnabled" />
                </CuiToggleRow>

                <CuiToggleRow
                  v-if="isCapacitor && draft.enabled && isDirectServer"
                  :label="$t('views.settings.notifications.this_device')"
                  :hint="$t('views.settings.notifications.this_device_direct')"
                >
                  <Button class="cui-button-small" :label="$t('views.settings.notifications.cloud_sign_in')" @click="bounceToCloudFrontend" />
                </CuiToggleRow>

                <CuiToggleRow v-else-if="isCapacitor && draft.enabled && instanceStore.isHomeActive" :label="$t('views.settings.notifications.this_device')">
                  <template #hint>
                    <Message :severity="deviceSynced ? 'secondary' : 'warn'" variant="simple" size="small" class="cui-input-switch-hint">
                      {{ deviceSynced ? $t('views.settings.notifications.this_device_synced') : $t('views.settings.notifications.this_device_unsynced') }}
                    </Message>
                  </template>
                  <Button
                    :severity="deviceSynced ? 'secondary' : undefined"
                    :loading="syncing"
                    class="cui-button-small"
                    :label="deviceSynced ? $t('views.settings.notifications.resync') : $t('views.settings.notifications.sync')"
                    @click="onSyncDevice"
                  />
                </CuiToggleRow>

                <CuiToggleRow
                  v-else-if="isElectronApp && draft.enabled"
                  :label="$t('views.settings.notifications.this_device')"
                  :hint="$t('views.settings.notifications.this_device_desktop')"
                >
                  <ToggleSwitch :model-value="desktopEnabled" :loading="desktopLoading" @update:model-value="onToggleDesktop" />
                </CuiToggleRow>

                <div v-if="draft.enabled" class="flex flex-col gap-2">
                  <CuiToggleRow :label="$t('views.settings.notifications.quiet_hours')" :hint="$t('views.settings.notifications.quiet_hours_info')">
                    <ToggleSwitch :model-value="!!draft.quietHours" @update:model-value="toggleQuietHours" />
                  </CuiToggleRow>

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
              </div>

              <div v-if="draft?.enabled" class="flex">
                <Button
                  type="button"
                  :loading="saving === 'general'"
                  :disabled="!dirty.general || !!saving"
                  class="cui-button-medium ml-auto"
                  :label="$t('components.form.button.save')"
                  @click="saveCard('general')"
                />
              </div>
            </div>
          </template>
        </Card>
      </div>

      <CuiEventPopupSettings v-if="showRest && isElectronApp" />

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

              <div v-else class="flex flex-col gap-2">
                <CuiToggleRow v-for="info in sources.system" :key="info.type" :label="systemLabel(info)" :hint="info.description">
                  <ToggleSwitch :model-value="isSystemTypeEnabled(info.type)" @update:model-value="(v) => setSystemTypeEnabled(info.type, v as boolean)" />
                </CuiToggleRow>
              </div>

              <div class="flex">
                <Button
                  type="button"
                  :loading="saving === 'system'"
                  :disabled="!dirty.system || !!saving"
                  class="cui-button-medium ml-auto"
                  :label="$t('components.form.button.save')"
                  @click="saveCard('system')"
                />
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

              <div v-else class="flex flex-col gap-2">
                <CuiToggleRow v-for="plugin in sources.plugins" :key="plugin.id" :label="plugin.name">
                  <ToggleSwitch :model-value="isPluginSourceEnabled(plugin.id)" @update:model-value="(v) => setPluginSourceEnabled(plugin.id, v as boolean)" />
                </CuiToggleRow>
              </div>

              <div class="flex">
                <Button
                  type="button"
                  :loading="saving === 'plugins'"
                  :disabled="!dirty.plugins || !!saving"
                  class="cui-button-medium ml-auto"
                  :label="$t('components.form.button.save')"
                  @click="saveCard('plugins')"
                />
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
                      :model-value="deviceEdits[data.id]?.name ?? data.name"
                      class="w-full max-w-xs min-w-[150px]"
                      @update:model-value="(v) => editDevice(data.id, { name: v ?? '' })"
                      @blur="dropEmptyName(data.id)"
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
                    <ToggleSwitch :model-value="deviceEdits[data.id]?.active ?? data.active" @update:model-value="(v) => editDevice(data.id, { active: v as boolean })" />
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

              <div v-if="devices?.length" class="flex">
                <Button
                  type="button"
                  :loading="saving === 'devices'"
                  :disabled="!dirty.devices || !!saving"
                  class="cui-button-medium ml-auto"
                  :label="$t('components.form.button.save')"
                  @click="saveDevices"
                />
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

import { NotificationsQuery } from '@/api/routes/notifications.js';
import { bounceToCloudFrontend, getCurrentServerId, getDirectServer, isCapacitor } from '@/connection/index.js';

import type { UpdateNotifierDevicePatch } from '@/api/routes/notifications.js';
import type { DBNotificationSettings, SystemNotificationType } from '@shared/types';

type Card = 'general' | 'system' | 'plugins';

const CARD_FIELDS = { general: 'quietHours', system: 'systemTypes', plugins: 'sources' } as const satisfies Record<Card, keyof DBNotificationSettings>;

const notificationsQuery = new NotificationsQuery();

const { t, te } = useI18n();
const toast = useCuiToast();
const instanceStore = useInstanceStore();
const isAdmin = hasPermission(undefined, 'admin');
const isDirectServer = getDirectServer() !== null;
const { registerForPush, forgetIfThisDevice, getSyncState, restoreMarker } = usePushRegistration();
const { isElectronApp, electron } = useElectron();
const { states: permissionStates, refresh: refreshPermissions } = usePermissions();

const { data: settings, isLoading: settingsLoading } = notificationsQuery.getSettingsQuery();
const { data: devices, isLoading: devicesLoading } = notificationsQuery.listDevicesQuery(() => true);
const { data: sources, isLoading: sourcesLoading } = notificationsQuery.listSourcesQuery();
const { mutate: saveSettings } = notificationsQuery.setSettingsQuery();
const { mutateAsync: saveSettingsSilent } = notificationsQuery.setSettingsQuerySilent();
const { mutate: revokeDevice } = notificationsQuery.revokeDeviceQuery();
const { mutateAsync: updateDevice } = notificationsQuery.updateDeviceQuery();

const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

const draft = ref<DBNotificationSettings | null>(null);
const saving = ref<Card | 'devices' | null>(null);
const enabling = ref(false);
const deviceSynced = ref(false);
const syncing = ref(false);
const desktopEnabled = ref(true);
const desktopLoading = ref(false);
const revokingId = ref<string | null>(null);
const deviceEdits = reactive<Record<string, UpdateNotifierDevicePatch>>({});

const dirty = computed(() => {
  const changed = (card: Card) => !!draft.value && !!settings.value && !isEqual(cardValue(draft.value, card), cardValue(settings.value, card));
  return { general: changed('general'), system: changed('system'), plugins: changed('plugins'), devices: devicePatches.value.length > 0 };
});
const devicePatches = computed(() =>
  (devices.value ?? []).flatMap((device) => {
    const edit = deviceEdits[device.id];
    const patch: UpdateNotifierDevicePatch = {};
    const name = edit?.name?.trim();
    if (name && name !== device.name) patch.name = name;
    if (edit?.active !== undefined && edit.active !== device.active) patch.active = edit.active;
    return Object.keys(patch).length ? [{ deviceId: device.id, patch }] : [];
  }),
);
const showRest = computed(() => !!draft.value?.enabled);
const quietHoursFrom = computed(() => parseTime(draft.value?.quietHours?.from));
const quietHoursTo = computed(() => parseTime(draft.value?.quietHours?.to));

function syncDraft(saved: DBNotificationSettings | undefined, previous: DBNotificationSettings | undefined) {
  if (!saved) return;
  const next: DBNotificationSettings = JSON.parse(JSON.stringify(saved));
  const current = draft.value;
  if (current && previous) {
    for (const card of Object.keys(CARD_FIELDS) as Card[]) {
      const field = CARD_FIELDS[card];
      if (!isEqual(cardValue(current, card), cardValue(previous, card))) Object.assign(next, { [field]: current[field] });
    }
  }
  draft.value = next;
}

function cardValue(values: DBNotificationSettings, card: Card) {
  const value = values[CARD_FIELDS[card]];
  return value && Object.keys(value).length ? value : null;
}

function saveCard(card: Card) {
  if (!draft.value || !settings.value) return;
  const field = CARD_FIELDS[card];
  saving.value = card;
  saveSettings({ settings: { ...settings.value, [field]: draft.value[field] } }, { onSettled: () => (saving.value = null) });
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

async function onToggleEnabled(next: boolean) {
  if (!draft.value || !settings.value) return;
  enabling.value = true;
  try {
    await saveSettingsSilent({ settings: { ...settings.value, enabled: next } });
  } catch (err: any) {
    toast.add({ severity: 'error', detail: err, life: 3000 });
  } finally {
    enabling.value = false;
  }
}

async function refreshDeviceSync() {
  const serverId = instanceStore.isHomeActive ? getCurrentServerId() : null;
  const state = serverId ? await getSyncState(serverId, devices.value) : { status: 'unknown' as const };
  deviceSynced.value = state.status === 'registered';
  if (state.status === 'registered' && state.device && serverId) await restoreMarker(serverId, state.device.id);
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
        delete deviceEdits[deviceId];
        if (serverId) await forgetIfThisDevice(serverId, deviceId);
        refreshDeviceSync();
      },
      onSettled: () => (revokingId.value = null),
    },
  );
}

function editDevice(deviceId: string, change: UpdateNotifierDevicePatch) {
  deviceEdits[deviceId] = { ...deviceEdits[deviceId], ...change };
}

function dropEmptyName(deviceId: string) {
  if (deviceEdits[deviceId]?.name?.trim() === '') delete deviceEdits[deviceId].name;
}

async function saveDevices() {
  saving.value = 'devices';
  try {
    await Promise.all(devicePatches.value.map(({ deviceId, patch }) => updateDevice({ deviceId, patch }).then(() => delete deviceEdits[deviceId])));
    toast.add({ severity: 'success', detail: t('views.settings.notifications.saved'), life: 3000 });
  } catch {
    // the mutation shows the error
  } finally {
    saving.value = null;
  }
}

watch(settings, (saved, previous) => syncDraft(saved, previous), { immediate: true });

watch(devices, () => isCapacitor && refreshDeviceSync(), { immediate: true });

onMounted(() => {
  if (isElectronApp) refreshDesktopEnabled();
  refreshPermissions();
});
</script>

<style scoped></style>
