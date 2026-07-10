<template>
  <div :key="resolvedPluginName">
    <CuiTopbarSlot position="left">
      <Button severity="secondary" text class="cui-button p-2 text-color non-draggable-region" @click="$router.push('/plugins')">
        <template #icon>
          <i-weui:back-filled class="w-6 h-6" />
        </template>
      </Button>
    </CuiTopbarSlot>

    <CuiTopbarSlot position="center">
      <span class="font-semibold text-xl truncate">{{ $t('views.plugin.title') }}</span>
    </CuiTopbarSlot>

    <div
      class="grid grid-auto grid-cols-1 lg:grid-cols-3 gap-6 lg:h-full"
      :class="{
        '!gap-2': lgBreakpoint,
      }"
    >
      <div class="lg:col-span-2 order-1 !h-[220px]">
        <Card v-if="!plugin" class="cui-card items-center justify-center !h-[220px]">
          <template #content>
            <div class="flex w-full h-full items-center justify-center">
              <ProgressSpinner class="w-[30px] h-[30px] m-0" stroke-width="5" />
            </div>
          </template>
        </Card>

        <CuiPluginCard v-else :plugin class="h-[220px]" />
      </div>

      <div class="lg:col-span-1 lg:row-span-3 order-2">
        <span class="lg:!hidden card-title">{{ $t('views.plugin.settings') }}</span>
        <Card
          class="cui-card !h-auto lg:!h-full"
          :class="{
            'items-center justify-center': pluginLoading || pluginConfigLoading,
          }"
        >
          <template #content>
            <div v-if="pluginLoading || pluginConfigLoading" class="w-full h-full flex items-center justify-center">
              <ProgressSpinner class="w-[30px] h-[30px] m-0" stroke-width="5" />
            </div>

            <div v-else>
              <h3 class="hidden lg:block text-base font-semibold border-b-[1px] border-color mb-3 pb-3">{{ $t('views.plugin.settings') }}</h3>

              <div v-if="plugin?.disabled" class="flex items-center justify-center w-full h-full text-muted text-sm">
                <span>{{ $t('views.plugin.disabled_info') }}</span>
              </div>

              <Tabs v-else v-model:value="currentTab" scrollable>
                <TabList
                  class="justify-between"
                  :pt="{ activeBar: { class: '!w-auto' }, content: { class: 'border-[1px] border-color cui-rounded-corner overflow-hidden' } }"
                >
                  <!-- @vue-ignore -->
                  <Tab v-for="(segment, i) in segments" :key="i" v-slot="slotProps" :disabled="segment.isInterface && plugin?.disabled" :value="segment.name" as-child>
                    <div
                      v-tooltip="{ value: segment.tooltip }"
                      v-bind="(slotProps as any).a11yAttrs"
                      class="flex flex-col items-center justify-center flex-1 content-background !py-3 h-[55px]"
                      :class="[
                        {
                          'hover:!text-color active:!text-color focus:!text-color': !(slotProps as any).active,
                        },
                        (slotProps as any).class,
                      ]"
                      @click="(slotProps as any).onClick"
                    >
                      <component :is="segment.icon" class="w-5 h-5" />
                    </div>
                  </Tab>
                </TabList>

                <TabPanels class="px-0 pb-0">
                  <!-- @vue-ignore -->
                  <TabPanel v-for="(segment, i) in segments" :key="i" v-slot="slotProps" :value="segment.name" as-child>
                    <div v-if="(slotProps as any).active" :class="(slotProps as any).class" v-bind="(slotProps as any).a11yAttrs">
                      <div v-if="segment.name === 'settings'" class="w-full h-full">
                        <div v-if="isNvr" class="flex flex-col items-center justify-center w-full h-full text-muted text-sm gap-3 text-center">
                          <span>{{ $t('views.plugin.nvr_settings_hint') }}</span>
                          <Button
                            class="cui-button-medium whitespace-nowrap"
                            :label="$t('views.plugin.nvr_settings_button')"
                            @click="$router.push('/settings/recordings')"
                          >
                            <template #icon>
                              <i-mdi:cog-outline class="w-4 h-4" />
                            </template>
                          </Button>
                        </div>

                        <CuiSchema
                          v-else-if="pluginConfig?.schema?.length"
                          :schema-form="{ schema: pluginConfig.schema, config: pluginConfig.config }"
                          :loading="storage.isLoading.value"
                          save-button-color="success"
                          @on-action="onAction"
                          @on-submit="onSubmit"
                          @on-form-submit="onFormSubmit"
                        />

                        <div v-else class="flex items-center justify-center w-full h-full text-muted text-sm">
                          <span>{{ $t('views.plugin.no_settings') }}</span>
                        </div>
                      </div>

                      <CuiDetectionInterface v-else-if="segment.name === 'motion_detection'" :plugin-name="resolvedPluginName" type="motionDetection" />
                      <CuiDetectionInterface v-else-if="segment.name === 'object_detection'" :plugin-name="resolvedPluginName" type="objectDetection" />
                      <CuiDetectionInterface v-else-if="segment.name === 'audio_detection'" :plugin-name="resolvedPluginName" type="audioDetection" />
                      <CuiDetectionInterface v-else-if="segment.name === 'face_detection'" :plugin-name="resolvedPluginName" type="faceDetection" />
                      <CuiDetectionInterface v-else-if="segment.name === 'license_plate_detection'" :plugin-name="resolvedPluginName" type="licensePlateDetection" />
                      <CuiDetectionInterface v-else-if="segment.name === 'classifier_detection'" :plugin-name="resolvedPluginName" type="classifierDetection" />
                      <CuiDetectionInterface v-else-if="segment.name === 'clip_detection'" :plugin-name="resolvedPluginName" type="clipDetection" />

                      <CuiNotificationInterface v-else-if="segment.name === 'notification'" :plugin-name="resolvedPluginName" />

                      <div v-else-if="segment.name === 'cameras'" class="w-full h-full">
                        <div v-if="!contract?.cameras?.length" class="flex items-center justify-center w-full h-full text-muted text-sm">
                          <span>{{ $t('views.plugin.no_cameras') }}</span>
                        </div>

                        <div v-else-if="!isPluginRunning" class="flex items-center justify-center gap-2 w-full h-full text-muted text-sm">
                          <i-mdi:information-outline class="w-4 h-4 flex-shrink-0" />
                          <span>{{ $t('views.plugin.assignment_requires_running') }}</span>
                        </div>

                        <div v-for="camera in contract.cameras" v-else :key="camera.name" class="cui-list-item">
                          <CuiListItem
                            :disabled="addPluginPending || removePluginPending || storage.isLoading.value"
                            :active="enabledCameras.includes(camera.name)"
                            class="h-14"
                            @click="drawer.open({ cameraName: camera.name })"
                          >
                            <span>{{ camera.name }}</span>

                            <template v-if="!plugin || !isCameraCreatedByPlugin(camera, plugin.pluginName)" #append>
                              <ToggleSwitch
                                :model-value="enabledCameras.includes(camera.name)"
                                :disabled="addPluginPending || removePluginPending || storage.isLoading.value || !isPluginRunning"
                                @update:model-value="() => toggleCamera(camera)"
                              />
                            </template>
                          </CuiListItem>
                        </div>
                      </div>
                    </div>
                  </TabPanel>
                </TabPanels>
              </Tabs>
            </div>
          </template>
        </Card>
      </div>

      <div class="lg:col-span-2 order-3">
        <span class="lg:!hidden card-title">{{ $t('views.plugin.readme') }}</span>
        <Card class="cui-card !h-auto lg:!h-full">
          <template #content>
            <h3 class="hidden lg:block text-base font-semibold border-b-[1px] border-color mb-3 pb-3">{{ $t('views.plugin.readme') }}</h3>
            <div v-if="readmeLoading" class="flex w-full h-full items-center justify-center">
              <ProgressSpinner class="w-[30px] h-[30px] m-0" stroke-width="5" />
            </div>
            <div v-else class="markdown-body" v-html="markdownIt.render(readme || $t('views.plugin.no_readme'))" />
          </template>
        </Card>
      </div>

      <div class="lg:col-span-2 order-4">
        <span class="lg:!hidden card-title">{{ $t('views.plugin.changelog') }}</span>
        <Card class="cui-card !h-auto lg:!h-full">
          <template #content>
            <h3 class="hidden lg:block text-base font-semibold border-b-[1px] border-color mb-3 pb-3">{{ $t('views.plugin.changelog') }}</h3>
            <div v-if="changelogLoading" class="flex w-full h-full items-center justify-center">
              <ProgressSpinner class="w-[30px] h-[30px] m-0" stroke-width="5" />
            </div>
            <div v-else class="markdown-body" v-html="markdownIt.render(changelog || $t('views.plugin.no_changelog'))" />
          </template>
        </Card>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import 'highlight.js/styles/vs2015.min.css';

import { usePluginStorage } from '@camera.ui/browser';
import { hasInterface, isHub, PluginInterface, SensorType } from '@camera.ui/sdk';
import { generateStorableConfig, PLUGIN_STATUS } from '@shared/types';
import hljs from 'highlight.js/lib/core';
import json from 'highlight.js/lib/languages/json';
import python from 'highlight.js/lib/languages/python';
import typescript from 'highlight.js/lib/languages/typescript';
import yaml from 'highlight.js/lib/languages/yaml';
import MarkdownIt from 'markdown-it';
import CctvIcon from '~icons/bxs/cctv';
import AudioIcon from '~icons/lucide/audio-lines';
import ObjectIcon from '~icons/material-symbols/detection-and-zone';
import FaceIcon from '~icons/material-symbols/face';
import MotionIcon from '~icons/material-symbols/motion-blur-rounded';
import BellIcon from '~icons/mdi/bell';
import SettingsIcon from '~icons/mdi/cog';
import ClassifyIcon from '~icons/mingcute/classify-2-fill';
import TextAaIcon from '~icons/ph/text-aa-fill';
import PlateIcon from '~icons/solar/plate-bold';

import { CamerasQuery } from '@/api/routes/cameras.js';
import { PluginsQuery } from '@/api/routes/plugins.js';
import { pluginMessageResponseTypeToToastType } from '@/common/utils.js';
import PluginSchemaDialog from '@/components/CuiDialog/templates/PluginSchema/PluginSchema.vue';

import type { PluginSchemaProps } from '@/components/CuiDialog/templates/PluginSchema/types.js';
import type { PluginConfig } from '@camera.ui/sdk';
import type { PluginContractCamera } from '@shared/types';

interface SegmentItem {
  name: string;
  icon: any;
  isInterface: boolean;
  tooltip: string;
}

const camerasQuery = new CamerasQuery();
const pluginsQuery = new PluginsQuery();

const log = useLogger();
const drawer = useCuiCameraDrawer();
const route = useRoute();
const toast = useCuiToast();
const dialog = useCuiDialog();
const { lgBreakpoint } = useSharedCuiBreakpoint();
const { t } = useI18n();

const pluginScope = ref(route.params.scope as string);
const pluginName = ref(route.params.pluginname as string);

const resolvedPluginName = computed(() => {
  if (pluginScope.value) {
    return `${pluginScope.value}/${pluginName.value}`;
  } else {
    return pluginName.value;
  }
});

const { contract: pluginContract, error: pluginProxyError } = usePlugin(resolvedPluginName);

pluginsQuery.toggleQueryActivator('getPluginContractQuery', false);

const { data: plugin, isBusy: pluginLoading } = pluginsQuery.getPluginQuery(resolvedPluginName);
const { data: readme, isBusy: readmeLoading } = pluginsQuery.getPluginReadmeQuery(resolvedPluginName);
const { data: changelog, isBusy: changelogLoading } = pluginsQuery.getPluginChangelogQuery(resolvedPluginName);
const { data: contract } = pluginsQuery.getPluginContractQuery(resolvedPluginName);

const storage = usePluginStorage(resolvedPluginName);
const pluginConfig = storage.config;
const pluginConfigLoading = storage.isLoading;

const { mutate: addPlugin, isPending: addPluginPending } = camerasQuery.addCameraExtensionQuery();
const { mutate: removePlugin, isPending: removePluginPending } = camerasQuery.removeCameraExtensionQuery();

const currentTab = ref('settings');
const segments = ref<SegmentItem[]>([]);
const enabledCameras = ref<string[]>([]);
const pluginStatus = ref<PLUGIN_STATUS>(PLUGIN_STATUS.UNKNOWN);

let pluginStatusScope: ReturnType<typeof effectScope> | undefined;

const isNvr = computed(() => !!pluginContract.value && hasInterface(pluginContract.value, PluginInterface.NVR));

const isPluginRunning = computed(() => pluginStatus.value === PLUGIN_STATUS.READY || pluginStatus.value === PLUGIN_STATUS.STARTED);

const showSettingsTab = computed(() => {
  if (!isPluginRunning.value) return false;
  if (isNvr.value) return true;
  if (pluginConfig.value?.schema?.length) return true;
  return pluginConfigLoading.value;
});

const markdownIt = MarkdownIt('commonmark', {
  highlight(str: string, lang: string): string {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return '<pre><code class="hljs">' + hljs.highlight(str, { language: lang, ignoreIllegals: true }).value + '</code></pre>';
      } catch {
        // ignore
      }
    }

    return '<pre><code class="hljs">' + markdownIt.utils.escapeHtml(str) + '</code></pre>';
  },
});

hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('json', json);
hljs.registerLanguage('python', python);

// If true, this specific camera was created by the plugin and the toggle should be hidden
// (can't disable plugin for cameras it created).
function isCameraCreatedByPlugin(camera: PluginContractCamera, pluginName: string): boolean {
  return camera.pluginInfo?.name === pluginName;
}

async function onAction(state: { key: string }): Promise<void> {
  try {
    await storage.setValue(state.key, undefined);
    toast.add({ severity: 'success', detail: t('components.toast.config_updated'), life: 3000 });
  } catch (error) {
    toast.add({ severity: 'error', detail: error, life: 3000 });
  }
}

async function onSubmit(state: { key: string; payload: any }): Promise<void> {
  try {
    const response = await storage.submitValue(state.key, state.payload);

    if (response?.toast) {
      const type = pluginMessageResponseTypeToToastType(response.toast.type);
      toast.add({ severity: type, detail: response.toast.message, life: 3000 });
    }

    if (response?.schema?.length) {
      dialog.openComponentDialog<PluginSchemaProps>(PluginSchemaDialog, {
        data: {
          title: t('components.dialog.title.config'),
          hideConfirmButton: true,
          contentProps: {
            schemaConfig: { schema: response.schema, config: state.payload },
            pluginName: resolvedPluginName.value,
            buttonKey: state.key,
          },
        },
      });
    }
  } catch (error) {
    toast.add({ severity: 'error', detail: error, life: 3000 });
  }
}

async function onFormSubmit(configData: PluginConfig): Promise<void> {
  if (!pluginConfig.value?.schema.length) {
    return;
  }

  try {
    const newConfig = generateStorableConfig(pluginConfig.value.schema, configData);
    await storage.setConfig(newConfig);
    toast.add({ severity: 'success', detail: t('components.toast.config_updated'), life: 3000 });
  } catch (error) {
    toast.add({ severity: 'error', detail: error, life: 3000 });
  }
}

async function toggleCamera(camera: PluginContractCamera) {
  if (plugin.value && plugin.value.contract) {
    // Hub plugins: use 'hub' as assignment type. Other plugins: use provides types.
    const assignmentTypes: (SensorType | 'hub')[] = isHub(plugin.value.contract) ? ['hub'] : plugin.value.contract.provides;

    if (enabledCameras.value.includes(camera.name)) {
      for (const type of assignmentTypes) {
        removePlugin(
          { cameraname: camera.name, pluginname: plugin.value.pluginName, type },
          {
            onSuccess: () => {
              enabledCameras.value = enabledCameras.value.filter((enabledCamera) => enabledCamera !== camera.name);
            },
          },
        );
      }
    } else {
      for (const type of assignmentTypes) {
        addPlugin(
          { cameraname: camera.name, pluginname: plugin.value.pluginName, type },
          {
            onSuccess: () => {
              enabledCameras.value = [...enabledCameras.value, camera.name];
            },
          },
        );
      }
    }
  }
}

watch(
  plugin,
  (p) => {
    if (!p || p.disabled) {
      const settingsTab = segments.value.some((segment) => segment.name === 'settings');
      const camerasTab = segments.value.some((segment) => segment.name === 'cameras');
      if (settingsTab) {
        currentTab.value = 'settings';
      } else if (camerasTab) {
        currentTab.value = 'cameras';
      }
    }
  },
  { deep: true },
);

watch(
  route,
  () => {
    pluginName.value = route.params.pluginname as string;
  },
  { deep: true, immediate: true },
);

watch(
  [plugin, storage.isConnected],
  async ([p, connected]) => {
    if (p && !p.disabled && connected) {
      await storage.getConfig();
    }
  },
  { immediate: true },
);

watch(
  resolvedPluginName,
  (name) => {
    pluginStatusScope?.stop();
    if (!name) return;
    pluginStatusScope = effectScope();
    pluginStatusScope.run(() => {
      const statusSocket = usePluginsSocket(name);
      statusSocket.connect();
      watch(statusSocket.status, (status) => (pluginStatus.value = status), { immediate: true });
    });
  },
  { immediate: true },
);

watch(
  pluginConfig,
  () => {
    if (pluginConfig.value) {
      pluginsQuery.toggleQueryActivator('getPluginContractQuery', true);
    } else {
      pluginsQuery.toggleQueryActivator('getPluginContractQuery', false);
    }
  },
  { deep: true, immediate: true },
);

watch(
  [contract, pluginConfig, pluginContract, showSettingsTab, isPluginRunning],
  () => {
    const newSegments: SegmentItem[] = [];

    let interfaceExist = false;

    if (showSettingsTab.value) {
      newSegments.push({ name: 'settings', icon: SettingsIcon, isInterface: false, tooltip: t('views.plugin.settings_tab_tooltip') });
    }

    if (isPluginRunning.value && pluginContract.value && hasInterface(pluginContract.value, PluginInterface.MotionDetection)) {
      interfaceExist = true;
      newSegments.push({ name: 'motion_detection', icon: MotionIcon, isInterface: true, tooltip: t('views.plugin.motion_detection_tab_tooltip') });
    }

    if (isPluginRunning.value && pluginContract.value && hasInterface(pluginContract.value, PluginInterface.ObjectDetection)) {
      interfaceExist = true;
      newSegments.push({ name: 'object_detection', icon: ObjectIcon, isInterface: true, tooltip: t('views.plugin.object_detection_tab_tooltip') });
    }

    if (isPluginRunning.value && pluginContract.value && hasInterface(pluginContract.value, PluginInterface.AudioDetection)) {
      interfaceExist = true;
      newSegments.push({ name: 'audio_detection', icon: AudioIcon, isInterface: true, tooltip: t('views.plugin.audio_detection_tab_tooltip') });
    }

    if (isPluginRunning.value && pluginContract.value && hasInterface(pluginContract.value, PluginInterface.FaceDetection)) {
      interfaceExist = true;
      newSegments.push({ name: 'face_detection', icon: FaceIcon, isInterface: true, tooltip: t('views.plugin.face_detection_tab_tooltip') });
    }

    if (isPluginRunning.value && pluginContract.value && hasInterface(pluginContract.value, PluginInterface.LicensePlateDetection)) {
      interfaceExist = true;
      newSegments.push({ name: 'license_plate_detection', icon: PlateIcon, isInterface: true, tooltip: t('views.plugin.license_plate_detection_tab_tooltip') });
    }

    if (isPluginRunning.value && pluginContract.value && hasInterface(pluginContract.value, PluginInterface.ClassifierDetection)) {
      interfaceExist = true;
      newSegments.push({ name: 'classifier_detection', icon: ClassifyIcon, isInterface: true, tooltip: t('views.plugin.classifier_detection_tab_tooltip') });
    }

    if (isPluginRunning.value && pluginContract.value && hasInterface(pluginContract.value, PluginInterface.ClipDetection)) {
      interfaceExist = true;
      newSegments.push({ name: 'clip_detection', icon: TextAaIcon, isInterface: true, tooltip: t('views.plugin.clip_detection_tab_tooltip') });
    }

    if (isPluginRunning.value && pluginContract.value && hasInterface(pluginContract.value, PluginInterface.Notifier)) {
      interfaceExist = true;
      newSegments.push({ name: 'notification', icon: BellIcon, isInterface: true, tooltip: t('views.plugin.notification_tab_tooltip') });
    }
    newSegments.push({ name: 'cameras', icon: CctvIcon, isInterface: false, tooltip: t('views.plugin.cameras_tab_tooltip') });

    if (contract.value?.cameras.length) {
      // Check camera.plugins to determine if plugin is enabled for camera
      // (consistent with the camera drawer's "More" tab behavior).
      enabledCameras.value = contract.value.cameras.filter((camera) => camera.plugins?.some((p) => p.name === resolvedPluginName.value)).map((camera) => camera.name);
    }

    segments.value = [...newSegments];

    if (!plugin.value?.disabled) {
      if (showSettingsTab.value) {
        currentTab.value = 'settings';
      } else if (interfaceExist) {
        currentTab.value = segments.value.filter((segment) => segment.isInterface)[0].name;
      } else {
        currentTab.value = 'cameras';
      }
    }
  },
  { deep: true, immediate: true },
);

watch(pluginProxyError, (error) => {
  if (error && plugin.value && !plugin.value.disabled) {
    log.error('Error connecting to plugin:', error);
  }
});

onUnmounted(() => pluginStatusScope?.stop());
</script>

<style scoped>
.grid-auto {
  grid-template-rows: 220px auto;
}
</style>
