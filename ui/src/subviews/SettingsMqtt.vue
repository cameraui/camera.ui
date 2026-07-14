<template>
  <div class="w-full h-full">
    <div v-if="!mqttForm" class="w-full h-full flex items-center justify-center">
      <ProgressSpinner class="w-[30px] h-[30px] m-0" stroke-width="5" />
    </div>

    <div v-else class="flex flex-col w-full gap-6">
      <div>
        <span class="card-title">{{ $t('views.settings.status') }}</span>
        <Card class="cui-card">
          <template #content>
            <div class="flex items-center gap-4">
              <div class="flex flex-col field-switch-gap min-w-0">
                <span class="text-sm font-bold text-color">{{ $t('views.settings.mqtt_broker') }}</span>
                <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint truncate">
                  {{ statusHint }}
                </Message>
              </div>
              <Tag class="ml-auto shrink-0" :severity="statusSeverity" :value="statusLabel" />
            </div>
          </template>
        </Card>
      </div>

      <Form class="flex flex-col w-full gap-6" :validation-schema="mqttPatchSchema" @submit="onSave">
        <div>
          <span class="card-title">{{ $t('views.settings.mqtt_broker') }}</span>
          <Card class="cui-card">
            <template #content>
              <div class="flex flex-col gap-6">
                <div class="flex items-center gap-4 cui-toggle-switch">
                  <div class="flex flex-col field-switch-gap">
                    <label for="enabled" class="cui-label-switch">{{ $t('components.form.label.enabled') }}</label>
                    <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint">{{ $t('views.settings.mqtt_enabled_info') }}</Message>
                  </div>
                  <ToggleSwitch v-model="mqttForm.enabled" class="ml-auto shrink-0" />
                </div>

                <div class="flex flex-col field-gap">
                  <label for="mode" class="cui-label">{{ $t('views.settings.mqtt_mode_label') }}</label>
                  <Select v-model="mqttForm.mode" :options="modeOptions" option-label="label" option-value="value" />
                  <Message v-if="mqttForm.mode === 'embedded'" severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
                    $t('views.settings.mqtt_mode_embedded_info')
                  }}</Message>
                </div>

                <template v-if="mqttForm.mode === 'external'">
                  <div class="flex flex-col sm:flex-row gap-6">
                    <Field v-slot="{ field, errors }" v-model.trim="mqttForm.host" name="host" as="div" class="flex flex-col field-gap flex-1 min-w-0">
                      <label for="host" class="cui-label">{{ $t('views.settings.mqtt_host_label') }}</label>
                      <InputText v-bind="field" :invalid="errors.length > 0" type="text" placeholder="192.168.1.10" class="w-full" />
                      <Transition name="fade">
                        <ErrorMessage name="host" class="cui-input-error" />
                      </Transition>
                    </Field>

                    <div class="flex flex-col field-gap w-full sm:w-40 shrink-0">
                      <label for="port" class="cui-label">{{ $t('views.settings.mqtt_port_label') }}</label>
                      <InputNumber v-model="mqttForm.port" :min="1" :max="65535" :use-grouping="false" fluid />
                    </div>
                  </div>

                  <div class="flex flex-col field-gap">
                    <label for="protocol" class="cui-label">{{ $t('views.settings.mqtt_protocol_label') }}</label>
                    <Select v-model="mqttForm.protocol" :options="protocolOptions" option-label="label" option-value="value" />
                  </div>

                  <div class="flex flex-col sm:flex-row gap-6">
                    <div class="flex flex-col field-gap flex-1 min-w-0">
                      <label for="username" class="cui-label">{{ $t('views.settings.mqtt_username_label') }}</label>
                      <InputText v-model.trim="mqttForm.username" type="text" autocomplete="off" class="w-full" />
                    </div>

                    <div class="flex flex-col field-gap flex-1 min-w-0">
                      <label for="password" class="cui-label">{{ $t('views.settings.mqtt_password_label') }}</label>
                      <Password v-model="passwordInput" :feedback="false" toggle-mask fluid autocomplete="new-password" :placeholder="passwordSet ? '••••••••' : ''" />
                      <Message v-if="passwordSet" severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
                        $t('views.settings.mqtt_password_keep_hint')
                      }}</Message>
                    </div>
                  </div>
                </template>

                <template v-else>
                  <div class="flex flex-col field-gap">
                    <label for="brokerAddress" class="cui-label">{{ $t('views.settings.mqtt_broker_address') }}</label>
                    <InputGroup>
                      <InputText :model-value="brokerAddress" readonly class="font-mono text-xs" />
                      <InputGroupAddon>
                        <CuiActionButton
                          :action-text="$t('components.form.tooltip.copied')"
                          :icon="CopyIcon"
                          :button-props="{ severity: 'secondary', text: true }"
                          @action="copyToClipboard(brokerAddress)"
                        />
                      </InputGroupAddon>
                    </InputGroup>
                    <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('views.settings.mqtt_broker_address_hint') }}</Message>
                  </div>

                  <div class="flex flex-col sm:flex-row gap-6">
                    <div class="flex flex-col field-gap w-full sm:w-40 shrink-0">
                      <label for="brokerPort" class="cui-label">{{ $t('views.settings.mqtt_port_label') }}</label>
                      <InputNumber v-model="mqttForm.broker.port" :min="1" :max="65535" :use-grouping="false" fluid />
                    </div>

                    <div class="flex flex-col field-gap flex-1 min-w-0">
                      <label for="brokerUsername" class="cui-label">{{ $t('views.settings.mqtt_username_label') }}</label>
                      <InputText v-model.trim="mqttForm.broker.username" type="text" autocomplete="off" class="w-full" />
                    </div>

                    <div class="flex flex-col field-gap flex-1 min-w-0">
                      <label for="brokerPassword" class="cui-label">{{ $t('views.settings.mqtt_password_label') }}</label>
                      <InputGroup>
                        <Password v-model="mqttForm.broker.password" :feedback="false" toggle-mask fluid autocomplete="off" />
                        <InputGroupAddon>
                          <CuiActionButton
                            :action-text="$t('components.form.tooltip.copied')"
                            :icon="CopyIcon"
                            :button-props="{ severity: 'secondary', text: true }"
                            @action="copyToClipboard(mqttForm!.broker.password ?? '')"
                          />
                        </InputGroupAddon>
                      </InputGroup>
                    </div>
                  </div>
                </template>

                <div class="flex flex-col sm:flex-row gap-6">
                  <Field v-slot="{ field, errors }" v-model.trim="mqttForm.clientId" name="clientId" as="div" class="flex flex-col field-gap flex-1">
                    <label for="clientId" class="cui-label">{{ $t('views.settings.mqtt_client_id_label') }}</label>
                    <InputText v-bind="field" :invalid="errors.length > 0" type="text" />
                    <Transition name="fade">
                      <ErrorMessage name="clientId" class="cui-input-error" />
                    </Transition>
                  </Field>

                  <Field v-slot="{ field, errors }" v-model.trim="mqttForm.topicPrefix" name="topicPrefix" as="div" class="flex flex-col field-gap flex-1">
                    <label for="topicPrefix" class="cui-label">{{ $t('views.settings.mqtt_topic_prefix_label') }}</label>
                    <InputText v-bind="field" :invalid="errors.length > 0" type="text" />
                    <Transition name="fade">
                      <ErrorMessage name="topicPrefix" class="cui-input-error" />
                    </Transition>
                    <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('views.settings.mqtt_topic_prefix_info') }}</Message>
                  </Field>
                </div>

                <template v-if="mqttForm.mode === 'external' && mqttForm.protocol === 'mqtts'">
                  <div class="flex items-center gap-4 cui-toggle-switch">
                    <div class="flex flex-col field-switch-gap">
                      <label for="rejectUnauthorized" class="cui-label-switch">{{ $t('views.settings.mqtt_tls_reject_unauthorized') }}</label>
                      <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint">{{
                        $t('views.settings.mqtt_tls_reject_unauthorized_info')
                      }}</Message>
                    </div>
                    <ToggleSwitch v-model="mqttForm.tls.rejectUnauthorized" class="ml-auto shrink-0" />
                  </div>

                  <div class="flex flex-col field-gap">
                    <label for="tlsCa" class="cui-label">{{ $t('views.settings.mqtt_tls_ca_label') }}</label>
                    <Textarea v-model="mqttForm.tls.ca" rows="3" auto-resize class="font-mono text-xs" />
                  </div>

                  <div class="flex flex-col field-gap">
                    <label for="tlsCert" class="cui-label">{{ $t('views.settings.mqtt_tls_cert_label') }}</label>
                    <Textarea v-model="mqttForm.tls.cert" rows="3" auto-resize class="font-mono text-xs" />
                  </div>

                  <div class="flex flex-col field-gap">
                    <label for="tlsKey" class="cui-label">{{ $t('views.settings.mqtt_tls_key_label') }}</label>
                    <Textarea v-model="mqttForm.tls.key" rows="3" auto-resize class="font-mono text-xs" />
                  </div>
                </template>

                <div class="flex items-center gap-4 cui-toggle-switch">
                  <div class="flex flex-col field-switch-gap">
                    <label for="haDiscovery" class="cui-label-switch">{{ $t('views.settings.mqtt_ha_discovery') }}</label>
                    <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint">{{ $t('views.settings.mqtt_ha_discovery_info') }}</Message>
                  </div>
                  <ToggleSwitch v-model="mqttForm.haDiscovery.enabled" class="ml-auto shrink-0" />
                </div>

                <Field
                  v-if="mqttForm.haDiscovery.enabled"
                  v-slot="{ field, errors }"
                  v-model.trim="mqttForm.haDiscovery.prefix"
                  name="haDiscovery.prefix"
                  as="div"
                  class="flex flex-col field-gap"
                >
                  <label for="haDiscovery.prefix" class="cui-label">{{ $t('views.settings.mqtt_ha_prefix_label') }}</label>
                  <InputText v-bind="field" :invalid="errors.length > 0" type="text" placeholder="homeassistant" />
                  <Transition name="fade">
                    <ErrorMessage name="haDiscovery.prefix" class="cui-input-error" />
                  </Transition>
                  <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('views.settings.mqtt_ha_prefix_info') }}</Message>
                </Field>

                <div class="flex items-center gap-3">
                  <Button
                    type="button"
                    severity="secondary"
                    :loading="testMutation.isPending.value"
                    :disabled="mqttForm.mode === 'external' && !mqttForm.host"
                    class="cui-button-medium"
                    :label="$t('views.settings.mqtt_test')"
                    @click="onTest"
                  />
                  <Button type="submit" :loading="patchMutation.isPending.value" class="cui-button-medium ml-auto" :label="$t('components.form.button.save')" />
                </div>
              </div>
            </template>
          </Card>
        </div>
      </Form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ErrorMessage, Field, Form } from 'vee-validate';
import CopyIcon from '~icons/fluent/copy-16-filled';

import { MqttQuery } from '@/api/routes/mqtt.js';
import { copyToClipboard, deepToRaw } from '@/common/utils.js';
import { mqttPatchSchema } from '@/schemas/mqtt.schema.js';

import type { DBMqttMode, DBMqttProtocol, MqttMaskedSettings, MqttStatus, PatchMqttInput } from '@shared/types';

interface MqttFormState extends Omit<MqttMaskedSettings, 'password'> {}

const mqttQuery = new MqttQuery();

const toast = useCuiToast();
const { t } = useI18n();

const { data: mqttInfo } = mqttQuery.getMqttInfoQuery();
const patchMutation = mqttQuery.patchMqttInfoMutation();
const testMutation = mqttQuery.testMqttConnectionMutation();

const serverChannel = useSocket('/server');

const protocolOptions: { label: string; value: DBMqttProtocol }[] = [
  { label: 'mqtt:// (TCP)', value: 'mqtt' },
  { label: 'mqtts:// (TLS)', value: 'mqtts' },
];

const modeOptions: { label: string; value: DBMqttMode }[] = [
  { label: t('views.settings.mqtt_mode_external'), value: 'external' },
  { label: t('views.settings.mqtt_mode_embedded'), value: 'embedded' },
];

const mqttForm = ref<MqttFormState | null>(null);
const passwordInput = ref('');
const liveStatus = ref<MqttStatus | null>(null);

const passwordSet = computed(() => mqttInfo.value?.passwordSet ?? false);

const status = computed(() => liveStatus.value ?? mqttInfo.value?.status ?? null);

const statusSeverity = computed(() => {
  switch (status.value?.state) {
    case 'connected':
      return 'success';
    case 'connecting':
    case 'reconnecting':
      return 'warn';
    case 'error':
      return 'danger';
    default:
      return 'secondary';
  }
});

const statusLabel = computed(() => {
  const state = status.value?.state ?? 'disabled';
  return t(`views.settings.mqtt_state_${state}`);
});

const statusHint = computed(() => {
  if (status.value?.lastError) return status.value.lastError;
  if (status.value?.broker?.running) return t('views.settings.mqtt_broker_running', { port: status.value.broker.port });
  return t('views.settings.mqtt_status_info');
});

const brokerAddress = computed(() => `mqtt://${window.location.hostname}:${mqttForm.value?.broker.port ?? 1883}`);

function buildPatch(): PatchMqttInput {
  const form = deepToRaw(mqttForm.value!);

  const patch: PatchMqttInput = {
    enabled: form.enabled,
    mode: form.mode,
    broker: {
      port: form.broker.port,
      username: form.broker.username?.trim() ? form.broker.username.trim() : null,
      password: form.broker.password?.trim() ? form.broker.password : null,
    },
    host: form.host?.trim() ? form.host.trim() : null,
    port: form.port,
    protocol: form.protocol,
    username: form.username?.trim() ? form.username.trim() : null,
    clientId: form.clientId,
    topicPrefix: form.topicPrefix,
    tls: {
      rejectUnauthorized: form.tls.rejectUnauthorized,
      ca: form.tls.ca?.trim() ? form.tls.ca : null,
      cert: form.tls.cert?.trim() ? form.tls.cert : null,
      key: form.tls.key?.trim() ? form.tls.key : null,
    },
    haDiscovery: {
      enabled: form.haDiscovery.enabled,
      prefix: form.haDiscovery.prefix,
    },
  };

  if (passwordInput.value) {
    patch.password = passwordInput.value;
  }

  return patch;
}

async function onSave(): Promise<void> {
  if (!mqttForm.value) return;
  await patchMutation.mutateAsync(buildPatch());
  passwordInput.value = '';
}

async function onTest(): Promise<void> {
  if (!mqttForm.value) return;

  const result = await testMutation.mutateAsync(buildPatch());
  if (result.ok) {
    toast.add({ severity: 'success', detail: t('components.toast.mqtt_test_success'), life: 3000 });
  } else {
    toast.add({ severity: 'error', detail: t('components.toast.mqtt_test_failed', { message: result.message ?? '' }), life: 5000 });
  }
}

watch(
  mqttInfo,
  (info) => {
    if (info && !mqttForm.value) {
      mqttForm.value = deepToRaw(info.settings);
    }
  },
  { immediate: true },
);

serverChannel.on<MqttStatus>('mqtt-status', (payload) => {
  liveStatus.value = payload;
});

serverChannel.onReady(async () => {
  try {
    const payload = await serverChannel.request<MqttStatus | undefined>('get-mqtt-status');
    if (payload) liveStatus.value = payload;
  } catch {
    // ignore
  }
});
</script>
