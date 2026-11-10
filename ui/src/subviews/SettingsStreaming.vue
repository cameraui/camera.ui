<template>
  <div class="w-full h-full">
    <div v-if="!form || !settings" class="w-full h-full flex items-center justify-center">
      <ProgressSpinner class="w-[30px] h-[30px] m-0" stroke-width="5" />
    </div>

    <div v-else class="flex flex-col w-full gap-6">
      <div>
        <span class="card-title">RTSP</span>
        <Card class="cui-card">
          <template #content>
            <div class="flex flex-col gap-6">
              <span class="text-sm">{{ $t('views.settings.streaming.rtsp_info') }}</span>

              <div class="flex flex-col sm:flex-row gap-6">
                <div class="flex flex-col field-gap w-full sm:w-40 shrink-0">
                  <label for="rtspPort" class="cui-label">{{ $t('views.settings.port') }}</label>
                  <InputNumber v-model="form.rtsp.port" input-id="rtspPort" :min="1" :max="65535" :use-grouping="false" :invalid="!!errors['rtsp.port']" fluid />
                  <span v-if="errors['rtsp.port']" class="cui-input-error">{{ errors['rtsp.port'] }}</span>
                  <Message v-else severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('views.settings.streaming.rtsp_port_hint') }}</Message>
                </div>

                <div class="flex flex-col field-gap flex-1 min-w-0">
                  <label for="rtspDefaultQuery" class="cui-label">{{ $t('views.settings.streaming.default_query') }}</label>
                  <Select
                    v-model="form.rtsp.defaultQuery"
                    input-id="rtspDefaultQuery"
                    :options="queryOptions"
                    option-label="label"
                    option-value="value"
                    :invalid="!!errors['rtsp.defaultQuery']"
                    fluid
                  >
                    <template #option="{ option }">
                      <div class="flex items-center justify-between w-full gap-4">
                        <span>{{ option.label }}</span>
                        <span class="font-mono text-xs text-muted-color">{{ option.value }}</span>
                      </div>
                    </template>
                  </Select>
                  <span v-if="errors['rtsp.defaultQuery']" class="cui-input-error">{{ errors['rtsp.defaultQuery'] }}</span>
                  <Message v-else severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
                    $t('views.settings.streaming.default_query_hint')
                  }}</Message>
                </div>
              </div>

              <div class="flex flex-col sm:flex-row gap-6">
                <div class="flex flex-col field-gap flex-1 min-w-0">
                  <label for="rtspUsername" class="cui-label">{{ $t('components.form.label.username') }}</label>
                  <InputText id="rtspUsername" v-model.trim="form.rtsp.username" :invalid="!!errors['rtsp.username']" autocomplete="off" class="w-full" />
                  <span v-if="errors['rtsp.username']" class="cui-input-error">{{ errors['rtsp.username'] }}</span>
                  <Message v-else severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('views.settings.streaming.login_hint') }}</Message>
                </div>

                <div class="flex flex-col field-gap flex-1 min-w-0">
                  <label for="rtspPassword" class="cui-label">{{ $t('components.form.label.password') }}</label>
                  <InputGroup>
                    <Password
                      v-model="form.rtsp.password"
                      input-id="rtspPassword"
                      :feedback="false"
                      :invalid="!!errors['rtsp.password']"
                      toggle-mask
                      fluid
                      autocomplete="new-password"
                    />
                    <InputGroupAddon>
                      <CuiActionButton
                        :action-text="$t('components.form.tooltip.copied')"
                        :icon="CopyIcon"
                        :button-props="{ severity: 'secondary', text: true }"
                        @action="copyToClipboard(form!.rtsp.password)"
                      />
                    </InputGroupAddon>
                  </InputGroup>
                  <span v-if="errors['rtsp.password']" class="cui-input-error">{{ errors['rtsp.password'] }}</span>
                </div>
              </div>

              <div class="flex">
                <Button
                  type="button"
                  class="cui-button-medium ml-auto"
                  :label="$t('components.form.button.save')"
                  :loading="saving === 'rtsp'"
                  :disabled="!dirty.rtsp || !!saving"
                  @click="confirmSave('rtsp')"
                />
              </div>
            </div>
          </template>
        </Card>
      </div>

      <div>
        <span class="card-title">ONVIF</span>
        <Card class="cui-card">
          <template #content>
            <div class="flex flex-col gap-6">
              <span class="text-sm">{{ $t('views.settings.streaming.onvif_info') }}</span>

              <CuiToggleRow :label="$t('views.settings.streaming.onvif_enabled')" :hint="$t('views.settings.streaming.onvif_enabled_hint')" label-for="onvifEnabled">
                <ToggleSwitch v-model="form.onvif.enabled" input-id="onvifEnabled" />
              </CuiToggleRow>

              <template v-if="form.onvif.enabled">
                <div class="flex flex-col sm:flex-row gap-6">
                  <div class="flex flex-col field-gap w-full sm:w-40 shrink-0">
                    <label for="onvifPort" class="cui-label">{{ $t('views.settings.port') }}</label>
                    <InputNumber v-model="form.onvif.port" input-id="onvifPort" :min="1" :max="65535" :use-grouping="false" :invalid="!!errors['onvif.port']" fluid />
                    <span v-if="errors['onvif.port']" class="cui-input-error">{{ errors['onvif.port'] }}</span>
                    <Message v-else severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
                      $t('views.settings.streaming.onvif_port_hint')
                    }}</Message>
                  </div>

                  <div class="flex flex-col field-gap flex-1 min-w-0">
                    <label for="onvifAddress" class="cui-label">{{ $t('views.settings.streaming.onvif_address') }}</label>
                    <InputGroup>
                      <InputText id="onvifAddress" :model-value="onvifAddress" readonly class="font-mono text-xs" />
                      <InputGroupAddon>
                        <CuiActionButton
                          :action-text="$t('components.form.tooltip.copied')"
                          :icon="CopyIcon"
                          :button-props="{ severity: 'secondary', text: true }"
                          @action="copyToClipboard(onvifAddress)"
                        />
                      </InputGroupAddon>
                    </InputGroup>
                    <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('views.settings.streaming.onvif_address_hint') }}</Message>
                  </div>
                </div>
              </template>

              <div class="flex">
                <Button
                  type="button"
                  class="cui-button-medium ml-auto"
                  :label="$t('components.form.button.save')"
                  :loading="saving === 'onvif'"
                  :disabled="!dirty.onvif || !!saving"
                  @click="confirmSave('onvif')"
                />
              </div>
            </div>
          </template>
        </Card>
      </div>

      <div>
        <span class="card-title">WebRTC</span>
        <Card class="cui-card">
          <template #content>
            <div class="flex flex-col gap-6">
              <span class="text-sm">{{ $t('views.settings.webrtc_info') }}</span>

              <CuiToggleRow :label="$t('views.settings.streaming.relay')" :hint="$t('views.settings.streaming.relay_hint')" label-for="webrtcRelay">
                <ToggleSwitch
                  :model-value="relay?.enabled ?? false"
                  input-id="webrtcRelay"
                  :disabled="!relay || putRelayLoading"
                  @update:model-value="(value: boolean) => putRelay(value)"
                />
                <template v-if="relay?.enabled" #below>
                  <div class="flex items-center gap-4">
                    <span class="text-sm">{{ $t('views.settings.status') }}</span>
                    <div class="ml-auto shrink-0">
                      <ProgressSpinner v-if="relay.status === 'checking'" class="w-[15px] h-[15px] m-0" stroke-width="5" />
                      <RouterLink v-else-if="relay.status === 'unlinked'" :to="{ name: 'SettingsRemote' }" class="text-sm font-bold text-primary">{{
                        $t('views.settings.streaming.relay_unlinked')
                      }}</RouterLink>
                      <Tag
                        v-else
                        :severity="relay.status === 'ready' ? 'success' : 'secondary'"
                        :value="relay.status === 'ready' ? $t('views.settings.streaming.relay_ready') : $t('views.settings.streaming.relay_unavailable')"
                      />
                    </div>
                  </div>
                </template>
              </CuiToggleRow>

              <div class="flex flex-col sm:flex-row gap-6">
                <div class="flex flex-col field-gap w-full sm:w-40 shrink-0">
                  <label for="webrtcPort" class="cui-label">{{ $t('views.settings.port') }}</label>
                  <InputNumber v-model="form.webrtc.port" input-id="webrtcPort" :min="1" :max="65535" :use-grouping="false" :invalid="!!errors['webrtc.port']" fluid />
                  <span v-if="errors['webrtc.port']" class="cui-input-error">{{ errors['webrtc.port'] }}</span>
                  <Message v-else severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
                    $t('views.settings.streaming.webrtc_port_hint')
                  }}</Message>
                </div>

                <div class="flex flex-col field-gap flex-1 min-w-0">
                  <label for="webrtcCandidates" class="cui-label">{{ $t('views.settings.streaming.candidates') }}</label>
                  <AutoComplete
                    v-model="form.webrtc.candidates"
                    input-id="webrtcCandidates"
                    multiple
                    fluid
                    :typeahead="false"
                    :invalid="!!errors['webrtc.candidates']"
                    placeholder="192.168.1.10:8555"
                  />
                  <span v-if="errors['webrtc.candidates']" class="cui-input-error">{{ errors['webrtc.candidates'] }}</span>
                  <Message v-else severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('views.settings.streaming.candidates_hint') }}</Message>
                </div>
              </div>

              <div class="flex flex-col field-gap">
                <label for="webrtcStun" class="cui-label">{{ $t('views.settings.webrtc_stun_label') }}</label>
                <InputGroup>
                  <AutoComplete
                    v-model="webrtcForm.stun"
                    input-id="webrtcStun"
                    multiple
                    fluid
                    :typeahead="false"
                    :invalid="!!stunError"
                    :loading="webrtcLoading"
                    placeholder="stun:stun.example.com:3478"
                  />
                  <InputGroupAddon>
                    <Button
                      v-tooltip="{ value: $t('components.form.button.reset_defaults') }"
                      text
                      severity="secondary"
                      :disabled="webrtcLoading || stunIsDefault"
                      type="button"
                      @click="resetStun"
                    >
                      <template #icon>
                        <i-mdi:restore />
                      </template>
                    </Button>
                  </InputGroupAddon>
                </InputGroup>
                <span v-if="stunError" class="cui-input-error">{{ stunError }}</span>
                <Message v-else severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('views.settings.webrtc_stun_hint') }}</Message>
              </div>

              <div class="flex flex-col field-gap">
                <span class="cui-label">{{ $t('views.settings.webrtc_turn_label') }}</span>
                <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('views.settings.webrtc_turn_hint') }}</Message>
              </div>

              <div v-for="server in webrtcForm.turn" :key="server.key" class="cui-turn-server flex flex-col gap-4 rounded-xl p-4">
                <div class="flex flex-col field-gap">
                  <label :for="`webrtcTurn-${server.key}`" class="cui-label">{{ $t('views.settings.webrtc_turn_urls') }}</label>
                  <AutoComplete
                    v-model="server.urls"
                    :input-id="`webrtcTurn-${server.key}`"
                    multiple
                    fluid
                    :typeahead="false"
                    :invalid="!validTurnUrls(server.urls)"
                    placeholder="turn:turn.example.com:3478"
                  />
                  <span v-if="!validTurnUrls(server.urls)" class="cui-input-error">{{ $t('views.settings.webrtc_turn_invalid') }}</span>
                  <Message v-else severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('views.settings.webrtc_turn_urls_hint') }}</Message>
                </div>

                <div class="flex flex-col sm:flex-row gap-6">
                  <div class="flex flex-col field-gap flex-1 min-w-0">
                    <label :for="`webrtcUsername-${server.key}`" class="cui-label">{{ $t('components.form.label.username') }}</label>
                    <InputText :id="`webrtcUsername-${server.key}`" v-model.trim="server.username" type="text" autocomplete="off" class="w-full" />
                  </div>

                  <div class="flex flex-col field-gap flex-1 min-w-0">
                    <label :for="`webrtcPassword-${server.key}`" class="cui-label">{{ $t('components.form.label.password') }}</label>
                    <Password
                      v-model="server.password"
                      :input-id="`webrtcPassword-${server.key}`"
                      :feedback="false"
                      toggle-mask
                      fluid
                      autocomplete="new-password"
                      :placeholder="server.credentialSet ? '••••••••' : ''"
                    />
                    <Message v-if="server.credentialSet" severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
                      $t('views.settings.webrtc_password_keep_hint')
                    }}</Message>
                  </div>
                </div>

                <Button
                  type="button"
                  severity="danger"
                  outlined
                  class="cui-button-medium ml-auto"
                  :label="$t('components.form.button.remove')"
                  @click="removeTurnServer(server.key)"
                >
                  <template #icon>
                    <i-mdi:delete-outline class="w-4 h-4" />
                  </template>
                </Button>
              </div>

              <div class="flex items-center gap-2">
                <Button
                  type="button"
                  severity="secondary"
                  outlined
                  class="cui-button-medium"
                  :disabled="webrtcLoading"
                  :label="$t('components.form.button.add_turn_server')"
                  @click="addTurnServer"
                >
                  <template #icon>
                    <i-mdi:plus class="w-4 h-4" />
                  </template>
                </Button>
                <Button
                  type="button"
                  :disabled="!(dirty.webrtc || iceChanged) || iceInvalid || !!saving || putWebrtcLoading"
                  :loading="saving === 'webrtc' || putWebrtcLoading"
                  class="cui-button-medium ml-auto"
                  :label="$t('components.form.button.save')"
                  @click="confirmSave('webrtc')"
                />
              </div>
            </div>
          </template>
        </Card>
      </div>

      <div>
        <span class="card-title">{{ $t('views.settings.streaming.ports') }}</span>
        <Card class="cui-card">
          <template #content>
            <div class="flex flex-col gap-6">
              <span class="text-sm">{{ $t('views.settings.streaming.ports_info') }}</span>

              <div class="flex flex-col sm:flex-row gap-6">
                <div class="flex flex-col field-gap flex-1 min-w-0">
                  <label for="srtpPort" class="cui-label">{{ $t('views.settings.streaming.srtp_port') }}</label>
                  <InputNumber v-model="form.srtpPort" input-id="srtpPort" :min="1" :max="65535" :use-grouping="false" :invalid="!!errors.srtpPort" fluid />
                  <span v-if="errors.srtpPort" class="cui-input-error">{{ errors.srtpPort }}</span>
                  <Message v-else severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('views.settings.streaming.srtp_port_hint') }}</Message>
                </div>

                <div class="flex flex-col field-gap flex-1 min-w-0">
                  <label for="rtmpPort" class="cui-label">{{ $t('views.settings.streaming.rtmp_port') }}</label>
                  <InputNumber v-model="form.rtmpPort" input-id="rtmpPort" :min="1" :max="65535" :use-grouping="false" :invalid="!!errors.rtmpPort" fluid />
                  <span v-if="errors.rtmpPort" class="cui-input-error">{{ errors.rtmpPort }}</span>
                  <Message v-else severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('views.settings.streaming.rtmp_port_hint') }}</Message>
                </div>
              </div>

              <div class="flex">
                <Button
                  type="button"
                  class="cui-button-medium ml-auto"
                  :label="$t('components.form.button.save')"
                  :loading="saving === 'ports'"
                  :disabled="!dirty.ports || !!saving"
                  @click="confirmSave('ports')"
                />
              </div>
            </div>
          </template>
        </Card>
      </div>

      <div>
        <span class="card-title">{{ $t('views.settings.advanced') }}</span>
        <Card class="cui-card">
          <template #content>
            <CuiConfigEditor config="go2rtc" />
          </template>
        </Card>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { isEqual } from '@camera.ui/common/utils';
import { streamingSettingsSchema, STUN_URL_PATTERN, TURN_URL_PATTERN } from '@shared/types';
import CopyIcon from '~icons/fluent/copy-16-filled';

import { RemoteQuery } from '@/api/routes/remote.js';
import { ServerQuery } from '@/api/routes/server.js';
import { copyToClipboard, randomId } from '@/common/utils.js';
import { refreshIceServers } from '@/plugins/cameraui.js';

import type { StreamingSettingsInput } from '@shared/types';

type Section = 'rtsp' | 'onvif' | 'webrtc' | 'ports';

interface TurnServerForm {
  key: string;
  storedIndex?: number;
  credentialSet: boolean;
  urls: string[];
  username: string;
  password: string;
}

const serverQuery = new ServerQuery();
const remoteQuery = new RemoteQuery();

const dialog = useCuiDialog();
const { t } = useI18n();
const { settings, form, errors, saving, pending, dirty, changesOf, showIssues, save } = useSettingsForm('streaming', {
  rtsp: ['rtsp'],
  onvif: ['onvif'],
  webrtc: ['webrtc'],
  ports: ['srtpPort', 'rtmpPort'],
});

const { data: serverInfo } = serverQuery.getServerInfoQuery();
const { data: webrtcSettings, isBusy: webrtcLoading } = remoteQuery.getWebrtcQuery();
const { mutateAsync: putWebrtc, isPending: putWebrtcLoading } = remoteQuery.putWebrtcMutation();
const { data: relay } = remoteQuery.getRelayQuery();
const { mutate: putRelay, isPending: putRelayLoading } = remoteQuery.putRelayMutation();

const QUERY_PRESETS = [
  { value: 'video&audio', label: 'query_video_audio' },
  { value: 'video', label: 'query_video' },
  { value: 'mp4', label: 'query_mp4' },
  { value: 'video&audio=all', label: 'query_all_audio' },
  { value: 'video=all&audio=all', label: 'query_all_tracks' },
];

const webrtcForm = ref<{ stun: string[]; turn: TurnServerForm[] }>({ stun: [], turn: [] });

const queryOptions = computed(() => {
  const options = QUERY_PRESETS.map(({ value, label }) => ({ value, label: t(`views.settings.streaming.${label}`) }));
  const saved = settings.value?.streaming.rtsp.defaultQuery;
  if (saved && !QUERY_PRESETS.some(({ value }) => value === saved)) options.push({ value: saved, label: t('views.settings.streaming.query_custom') });
  return options;
});

const onvifAddress = computed(() => `http://${serverInfo.value?.serverAddresses?.[0] ?? window.location.hostname}:${form.value?.onvif.port}/onvif/device_service`);

const stunError = computed(() => (webrtcForm.value.stun.some((url) => !STUN_URL_PATTERN.test(url.trim())) ? t('views.settings.webrtc_stun_invalid') : ''));

const stunIsDefault = computed(() => isEqual(webrtcForm.value.stun, webrtcSettings.value?.defaultStun));

const iceInvalid = computed(
  () =>
    !!stunError.value ||
    webrtcForm.value.turn.some((server) => !server.urls.length || !validTurnUrls(server.urls) || !server.username || (!server.password && !server.credentialSet)),
);

const iceChanged = computed(() => {
  const { stun, turn } = webrtcForm.value;
  const stored = webrtcSettings.value;
  if (!stored) return false;
  return (
    !isEqual(stun, stored.stun) ||
    !isEqual(
      turn.map(({ urls, username, storedIndex }) => ({ urls, username, storedIndex })),
      stored.turn.map(({ urls, username }, storedIndex) => ({ urls, username, storedIndex })),
    ) ||
    turn.some((server) => server.password.length > 0)
  );
});

function confirmSave(section: Section): void {
  const patch = changesOf(section) as StreamingSettingsInput;
  const result = streamingSettingsSchema.safeParse(patch);
  if (!result.success) {
    showIssues(result.error.issues);
    return;
  }

  const restart = patch.rtsp?.port !== undefined || patch.webrtc?.port !== undefined || (patch.srtpPort !== undefined && settings.value!.streaming.srtpPort === null);
  const loginChanged = patch.rtsp?.username !== undefined || patch.rtsp?.password !== undefined;
  if (!restart && !loginChanged) {
    saveSection(section, patch);
    return;
  }

  const notes = [restart && t('views.settings.go2rtc_restart_confirm'), loginChanged && t('views.settings.streaming.login_change_confirm')];
  dialog.openTextDialog({
    data: {
      title: t('components.dialog.title.confirm'),
      contentText: notes.filter(Boolean).join('\n\n'),
      markdown: true,
      confirmText: restart ? t('components.form.button.save_and_restart') : t('components.form.button.save'),
      loading: pending,
    },
    onConfirm: () => saveSection(section, patch),
  });
}

async function saveSection(section: Section, patch: StreamingSettingsInput): Promise<void> {
  if (Object.keys(patch).length && !(await save(section, patch))) return;
  if (section === 'webrtc' && iceChanged.value) await saveIceServers();
}

async function saveIceServers(): Promise<void> {
  const { stun, turn } = webrtcForm.value;
  try {
    await putWebrtc({
      stun: stun.map((url) => url.trim()),
      turn: turn.map((server) => ({
        urls: server.urls.map((url) => url.trim()),
        username: server.username,
        ...(server.password ? { credential: server.password } : { storedIndex: server.storedIndex }),
      })),
    });
    await refreshIceServers();
  } catch {}
}

function validTurnUrls(urls: string[]): boolean {
  return urls.every((url) => TURN_URL_PATTERN.test(url.trim()));
}

function addTurnServer(): void {
  webrtcForm.value.turn.push({ key: randomId(), credentialSet: false, urls: [], username: '', password: '' });
}

function removeTurnServer(key: string): void {
  webrtcForm.value.turn = webrtcForm.value.turn.filter((server) => server.key !== key);
}

function resetStun(): void {
  if (!webrtcSettings.value) return;
  webrtcForm.value.stun = [...webrtcSettings.value.defaultStun];
}

watch(
  webrtcSettings,
  (settings) => {
    if (settings) {
      webrtcForm.value = {
        stun: [...settings.stun],
        turn: settings.turn.map((server, storedIndex) => ({
          key: randomId(),
          storedIndex,
          credentialSet: server.credentialSet,
          urls: [...server.urls],
          username: server.username,
          password: '',
        })),
      };
    }
  },
  { immediate: true },
);
</script>

<style scoped>
.cui-turn-server {
  background: var(--card-inner-background);
  border: 1px solid var(--border-color-inner);
}
</style>
