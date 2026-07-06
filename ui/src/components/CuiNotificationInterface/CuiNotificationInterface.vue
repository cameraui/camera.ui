<template>
  <div>
    <h3 class="text-base font-semibold border-b-[1px] border-color mb-3 pb-3">
      {{ $t('components.notification_interface.template') }}
    </h3>

    <div class="flex flex-col gap-4">
      <div class="flex flex-col field-gap">
        <label class="cui-label">{{ $t('components.notification_interface.title') }}</label>
        <InputText
          v-model="form.title"
          :placeholder="$t('components.notification_interface.title')"
          :invalid="titleError"
          class="w-full"
          @update:model-value="titleError = false"
        />
        <p v-if="titleError" class="text-red-500 text-sm">{{ $t('components.notification_interface.title_required') }}</p>
      </div>

      <div class="flex flex-col field-gap">
        <label class="cui-label">{{ $t('components.notification_interface.subtitle') }}</label>
        <InputText v-model="form.subtitle" :placeholder="$t('components.notification_interface.subtitle')" class="w-full" />
      </div>

      <div class="flex flex-col field-gap">
        <label class="cui-label">{{ $t('components.notification_interface.body') }}</label>
        <Textarea v-model="form.body" :placeholder="$t('components.notification_interface.body')" rows="3" class="w-full" />
      </div>

      <div class="flex flex-col field-gap">
        <label class="cui-label">{{ $t('components.notification_interface.severity') }}</label>
        <Select v-model="form.severity" :options="severityOptions" option-label="label" option-value="value" class="w-full" />
      </div>

      <div class="flex flex-col field-gap">
        <label class="cui-label">{{ $t('components.notification_interface.tag') }}</label>
        <InputText v-model="form.tag" placeholder="motion:cam-1" class="w-full" />
      </div>

      <div class="flex flex-col field-gap">
        <label class="cui-label">{{ $t('components.notification_interface.image_url') }}</label>
        <InputText v-model="form.imageUrl" placeholder="https://…" class="w-full" />
      </div>

      <div class="flex flex-col field-gap">
        <label class="cui-label">{{ $t('components.notification_interface.deep_link') }}</label>
        <InputText v-model="form.deepLink" placeholder="/cameras/cam-1" class="w-full" />
      </div>

      <div class="flex flex-col field-gap">
        <label class="cui-label">{{ $t('components.notification_interface.data') }}</label>

        <div v-for="(entry, index) in dataEntries" :key="index" class="flex gap-2 items-center">
          <InputText v-model="entry.key" :placeholder="$t('components.notification_interface.data_key')" class="flex-1 min-w-0" />
          <InputText v-model="entry.value" :placeholder="$t('components.notification_interface.data_value')" class="flex-1 min-w-0" />
          <Button text rounded severity="danger" class="cui-icon-md shrink-0" @click="removeDataEntry(index)">
            <template #icon>
              <i-mdi:close-circle width="100%" height="100%" />
            </template>
          </Button>
        </div>

        <Button severity="secondary" outlined fluid class="cui-button-medium" :label="$t('components.notification_interface.add_data')" @click="addDataEntry">
          <template #icon>
            <i-mdi:plus class="w-4 h-4" />
          </template>
        </Button>
      </div>
    </div>

    <div class="mt-8">
      <h3 class="text-base font-semibold border-b-[1px] border-color mb-3 pb-3">
        {{ $t('components.notification_interface.targets') }}
      </h3>

      <div v-if="devicesLoading" class="flex items-center justify-center w-full py-4">
        <ProgressSpinner class="w-[24px] h-[24px] m-0" stroke-width="5" />
      </div>

      <div v-else-if="!deviceOptions.length" class="flex items-center justify-center text-sm text-muted py-4 text-center">
        {{ $t('components.notification_interface.no_devices') }}
      </div>

      <div v-else class="flex flex-col field-gap">
        <span class="text-xs text-muted">{{ $t('components.notification_interface.targets_hint') }}</span>
        <MultiSelect
          v-model="selectedDeviceIds"
          :options="deviceOptions"
          option-label="label"
          option-value="id"
          :placeholder="$t('components.notification_interface.all_devices')"
          display="chip"
          filter
          class="w-full"
        />
      </div>
    </div>

    <div v-if="notificationSettingsSchema?.length" class="mt-8">
      <h3 class="text-base font-semibold border-b-[1px] border-color mb-3 pb-3">
        {{ $t('components.notification_interface.settings') }}
      </h3>

      <CuiSchema :schema-form="{ schema: notificationSettingsSchema, config: {} }" :loading="schemaLoading" />
    </div>

    <Button
      fluid
      class="mt-8 cui-button-medium"
      severity="success"
      :loading="sending"
      :disabled="!pluginProxy || sending"
      :label="$t('components.notification_interface.send_test')"
      @click="sendTest"
    />
  </div>
</template>

<script setup lang="ts">
import { Severity } from '@camera.ui/sdk';

import type { JsonSchema, Notification, NotifierDevice } from '@camera.ui/sdk';
import type { CuiNotificationInterfaceProps, NotificationDataEntry } from './types.js';

const props = defineProps<CuiNotificationInterfaceProps>();

const log = useLogger();
const { t } = useI18n();
const toast = useCuiToast();

const authStore = useAuthStore();
const { user } = storeToRefs(authStore);

const { pluginName } = toRefs(props);

const { plugin: pluginProxy } = usePlugin(pluginName);

const severityOptions = computed(() =>
  Object.values(Severity).map((value) => ({
    label: t(`components.notification_interface.severity_${value}`),
    value,
  })),
);

const form = reactive({
  title: 'Test notification',
  subtitle: '',
  body: 'This is a test notification from camera.ui',
  severity: Severity.Info as Severity,
  tag: '',
  imageUrl: '',
  deepLink: '',
});
const dataEntries = ref<NotificationDataEntry[]>([]);
const titleError = ref(false);
const sending = ref(false);
const devices = shallowRef<NotifierDevice[]>([]);
const devicesLoading = ref(false);
const selectedDeviceIds = ref<string[]>([]);
const notificationSettingsSchema = shallowRef<JsonSchema[] | undefined>();
const schemaLoading = ref(false);

const deviceOptions = computed(() => devices.value.map((device) => ({ id: device.id, label: device.name })));

async function loadDevices(): Promise<void> {
  if (!pluginProxy.value || !user.value?._id) return;

  devicesLoading.value = true;
  try {
    const ownerFilter = hasPermission(undefined, 'admin') ? [] : [user.value._id];
    devices.value = (await pluginProxy.value.getDevices?.(ownerFilter)) ?? [];
  } catch (error) {
    log.error('Failed to load notifier devices:', error);
    devices.value = [];
  } finally {
    devicesLoading.value = false;
  }
}

async function loadSettingsSchema(): Promise<void> {
  if (!pluginProxy.value) return;

  schemaLoading.value = true;
  try {
    notificationSettingsSchema.value = await pluginProxy.value.notificationSettings?.();
  } catch (error) {
    log.error('Failed to load notification settings schema:', error);
    notificationSettingsSchema.value = undefined;
  } finally {
    schemaLoading.value = false;
  }
}

function addDataEntry(): void {
  dataEntries.value.push({ key: '', value: '' });
}

function removeDataEntry(index: number): void {
  dataEntries.value.splice(index, 1);
}

function buildNotification(): Notification {
  const data: Record<string, string> = {};
  for (const entry of dataEntries.value) {
    if (entry.key.trim()) {
      data[entry.key.trim()] = entry.value;
    }
  }

  return {
    title: form.title.trim(),
    subtitle: form.subtitle.trim() || undefined,
    body: form.body.trim() || undefined,
    severity: form.severity,
    tag: form.tag.trim() || undefined,
    imageUrl: form.imageUrl.trim() || undefined,
    deepLink: form.deepLink.trim() || undefined,
    data: Object.keys(data).length ? data : undefined,
  };
}

async function sendTest(): Promise<void> {
  const proxy = pluginProxy.value;
  if (!proxy || sending.value) return;

  if (!form.title.trim()) {
    titleError.value = true;
    return;
  }

  sending.value = true;
  try {
    const notification = buildNotification();
    const targetIds = selectedDeviceIds.value.length ? selectedDeviceIds.value : devices.value.map((device) => device.id);

    await proxy.sendNotification?.(targetIds, notification);

    toast.add({ severity: 'success', detail: t('components.notification_interface.sent'), life: 3000 });
  } catch (error) {
    toast.add({ severity: 'error', detail: error, life: 3000 });
  } finally {
    sending.value = false;
  }
}

watch(
  pluginProxy,
  (proxy) => {
    if (proxy) {
      loadDevices();
      loadSettingsSchema();
    }
  },
  { immediate: true },
);
</script>

<style scoped></style>
