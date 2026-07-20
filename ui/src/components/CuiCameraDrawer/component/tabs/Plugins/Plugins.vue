<template>
  <div class="p-4 flex flex-col gap-2">
    <div v-if="categoriesLoading" class="w-full flex items-center justify-center py-8">
      <ProgressSpinner class="w-[30px] h-[30px] m-0" stroke-width="5" />
    </div>

    <template v-else>
      <span class="cui-label">{{ $t('components.camera_options.categories') }}</span>

      <CuiChipGroup v-model="selectedExtension" :disabled="isExtensionsLoading" mandatory @update:model-value="updateSelectedPlugin()">
        <CuiChip v-for="extension in extensionTypes" :key="extension" size="small" :disabled="configPatchLoading" :value="extension">
          {{ $t(`components.camera_options.chip_${extension}`) }}
        </CuiChip>
      </CuiChipGroup>

      <Divider class="m-0 py-3" />

      <div v-if="selectedExtension === 'cameraController'" class="flex flex-col gap-2">
        <template v-if="!cameraTabPlugins.length">
          <span class="cui-label">{{ $t('components.camera_options.chip_plugins') }}</span>
          <span class="text-sm text-muted text-center min-h-[30px]">{{ $t('components.camera_options.no_plugins_enabled') }}</span>
        </template>

        <template v-else>
          <span class="cui-label">{{ $t('components.camera_options.chip_plugins') }}</span>

          <CuiChipGroup v-model="selectedPlugin" :disabled="isExtensionsLoading" mandatory class="min-h-[30px]">
            <CuiChip
              v-for="extension in cameraTabPlugins"
              :key="extension.pluginName"
              size="small"
              :disabled="!isPluginEnabled(extension.pluginName) || configPatchLoading"
              :value="extension.pluginName"
            >
              {{ extension.displayName }}
            </CuiChip>
          </CuiChipGroup>

          <Divider class="m-0 py-3" />

          <span class="cui-label">{{ $t('components.camera_options.plugin_settings') }}</span>

          <div v-if="!selectedPlugin || !extensionConfig?.schema?.length" class="w-full flex items-center justify-center my-5">
            <ProgressSpinner v-if="extensionConfigLoading" class="w-[30px] h-[30px] m-0" stroke-width="5" />
            <span v-else class="text-sm text-muted text-center">{{ $t('components.camera_options.no_config') }}</span>
          </div>

          <CuiSchema
            v-else
            ref="schemaRef"
            :key="selectedPlugin"
            :schema-form="{ schema: extensionConfig.schema, config: extensionConfig.config }"
            :loading="configPatchLoading"
            @on-form-submit="(configData: PluginConfig) => onFormSubmit(selectedPlugin, configData)"
            @on-submit="(state) => onSubmit(state, selectedPlugin)"
            @on-action="(state) => onAction(state, selectedPlugin)"
          />
        </template>
      </div>

      <div v-else-if="selectedExtension === 'hub'" class="flex flex-col gap-2">
        <template v-if="!hubExtensions.length">
          <span class="cui-label">{{ $t('components.camera_options.chip_plugins') }}</span>
          <span class="text-sm text-muted text-center min-h-[30px]">{{ $t('components.camera_options.no_plugins_enabled') }}</span>
        </template>

        <template v-else>
          <span class="cui-label">{{ $t('components.camera_options.chip_plugins') }}</span>

          <CuiChipGroup v-model="selectedHubPlugin" :disabled="isExtensionsLoading" mandatory class="min-h-[30px]">
            <CuiChip
              v-for="extension in hubExtensions"
              :key="extension.pluginName"
              size="small"
              :disabled="!isPluginEnabled(extension.pluginName) || configPatchLoading"
              :value="extension.pluginName"
            >
              {{ extension.displayName }}
            </CuiChip>
          </CuiChipGroup>

          <Divider class="m-0 py-3" />

          <span class="cui-label">{{ $t('components.camera_options.plugin_settings') }}</span>

          <div v-if="!selectedPlugin || !extensionConfig?.schema?.length" class="w-full flex items-center justify-center my-5">
            <ProgressSpinner v-if="extensionConfigLoading" class="w-[30px] h-[30px] m-0" stroke-width="5" />
            <span v-else class="text-sm text-muted text-center">{{ $t('components.camera_options.no_config') }}</span>
          </div>

          <CuiSchema
            v-else
            ref="schemaRef"
            :key="selectedPlugin"
            :schema-form="{ schema: extensionConfig.schema, config: extensionConfig.config }"
            :loading="configPatchLoading"
            @on-form-submit="(configData: PluginConfig) => onFormSubmit(selectedPlugin, configData)"
            @on-submit="(state) => onSubmit(state, selectedPlugin)"
            @on-action="(state) => onAction(state, selectedPlugin)"
          />
        </template>
      </div>

      <div v-else-if="selectedExtension === 'detection'" class="flex flex-col gap-2">
        <template v-if="!availableDetectionTypes.length">
          <span class="cui-label">{{ $t('components.camera_options.sensor_types') }}</span>
          <span class="text-sm text-muted text-center min-h-[30px]">{{ $t('components.camera_options.no_plugins_enabled') }}</span>
        </template>

        <template v-else>
          <span class="cui-label">{{ $t('components.camera_options.sensor_types') }}</span>

          <CuiChipGroup v-model="selectedDetectionType" :disabled="isExtensionsLoading" mandatory class="min-h-[30px]">
            <CuiChip v-for="type in availableDetectionTypes" :key="type" size="small" :disabled="configPatchLoading" :value="type">
              {{ $t(`components.camera_options.sensor_type_${type}`) }}
            </CuiChip>
          </CuiChipGroup>

          <template v-if="detectionPluginsForType.length">
            <Divider class="m-0 py-3" />

            <span class="cui-label">{{ $t('components.camera_options.chip_plugins') }}</span>

            <CuiChipGroup v-model="selectedDetectionPlugin" :disabled="isExtensionsLoading" class="min-h-[30px]">
              <CuiChip
                v-for="extension in detectionPluginsForType"
                :key="extension.pluginName"
                size="small"
                filter
                :disabled="!isPluginEnabled(extension.pluginName) || configPatchLoading"
                :value="extension.pluginName"
              >
                {{ extension.displayName }}
              </CuiChip>
            </CuiChipGroup>

            <template v-if="selectedDetectionPlugin && selectedDetectionPlugin !== camera.pluginInfo?.name">
              <Divider class="m-0 py-3" />

              <span class="cui-label">{{ $t('components.camera_options.plugin_settings') }}</span>

              <div v-if="!detectionExtensionConfig?.schema?.length" class="w-full flex items-center justify-center my-5">
                <ProgressSpinner v-if="detectionExtensionConfigLoading" class="w-[30px] h-[30px] m-0" stroke-width="5" />
                <span v-else class="text-sm text-muted text-center">{{ $t('components.camera_options.no_config') }}</span>
              </div>

              <CuiSchema
                v-else
                :key="`detection-plugin-${selectedDetectionPlugin}`"
                :schema-form="{ schema: detectionExtensionConfig.schema, config: detectionExtensionConfig.config }"
                :loading="configPatchLoading"
                @on-form-submit="(configData: PluginConfig) => onDetectionPluginFormSubmit(configData)"
                @on-submit="(state) => onDetectionPluginSubmit(state)"
                @on-action="(state) => onDetectionPluginAction(state)"
              />
            </template>

            <Divider class="m-0 py-3" />

            <span class="cui-label">{{ $t('components.camera_options.sensors') }}</span>

            <CuiChipGroup v-if="detectionSensorsForType.length" v-model="selectedDetectionSensorId" :disabled="isExtensionsLoading" mandatory class="min-h-[30px]">
              <CuiChip v-for="sensor in detectionSensorsForType" :key="sensor.id" size="small" :disabled="configPatchLoading" :value="sensor.id">
                {{ sensor.displayName.value }}
                <template #append>
                  <Button
                    :text="selectedAccessorySensorId !== sensor.id"
                    rounded
                    :severity="selectedAccessorySensorId === sensor.id ? 'primary' : 'secondary'"
                    class="cui-icon-sm text-white"
                    @click.stop="openRenameSensorDialog(sensor)"
                  >
                    <template #icon>
                      <i-mdi:pencil width="100%" height="100%" />
                    </template>
                  </Button>
                </template>
              </CuiChip>
            </CuiChipGroup>

            <span v-else class="text-sm text-muted text-center min-h-[30px]">{{ $t('components.camera_options.no_sensors') }}</span>

            <template v-if="selectedDetectionSensorId">
              <Divider class="m-0 py-3" />

              <span class="cui-label">{{ $t('components.camera_options.sensor_settings') }}</span>

              <div v-if="!selectedDetectionSensorPluginName || !detectionSensorConfig?.schema?.length" class="w-full flex items-center justify-center my-5">
                <ProgressSpinner v-if="detectionSensorConfigLoading" class="w-[30px] h-[30px] m-0" stroke-width="5" />
                <span v-else class="text-sm text-muted text-center">{{ $t('components.camera_options.no_config') }}</span>
              </div>

              <CuiSchema
                v-else
                :key="`sensor-${selectedDetectionSensorId}`"
                :schema-form="{ schema: detectionSensorConfig.schema, config: detectionSensorConfig.config }"
                :loading="configPatchLoading"
                @on-form-submit="(configData: PluginConfig) => onDetectionFormSubmit(configData)"
                @on-submit="(state) => onDetectionSubmit(state)"
                @on-action="(state) => onDetectionAction(state)"
              />
            </template>
          </template>
        </template>
      </div>

      <div v-else-if="selectedExtension === 'core'" class="flex flex-col gap-2">
        <template v-if="!availableCoreTypes.length">
          <span class="cui-label">{{ $t('components.camera_options.sensor_types') }}</span>
          <span class="text-sm text-muted text-center min-h-[30px]">{{ $t('components.camera_options.no_plugins_enabled') }}</span>
        </template>

        <template v-else>
          <span class="cui-label">{{ $t('components.camera_options.sensor_types') }}</span>

          <CuiChipGroup v-model="selectedCoreType" :disabled="isExtensionsLoading" mandatory class="min-h-[30px]">
            <CuiChip v-for="type in availableCoreTypes" :key="type" size="small" :disabled="configPatchLoading" :value="type">
              {{ $t(`components.camera_options.sensor_type_${type}`) }}
            </CuiChip>
          </CuiChipGroup>

          <template v-if="corePluginsForType.length">
            <Divider class="m-0 py-3" />

            <span class="cui-label">{{ $t('components.camera_options.chip_plugins') }}</span>

            <CuiChipGroup v-model="selectedCorePlugin" :disabled="isExtensionsLoading" class="min-h-[30px]">
              <CuiChip
                v-for="extension in corePluginsForType"
                :key="extension.pluginName"
                size="small"
                filter
                :disabled="!isPluginEnabled(extension.pluginName) || configPatchLoading"
                :value="extension.pluginName"
              >
                {{ extension.displayName }}
              </CuiChip>
            </CuiChipGroup>

            <template v-if="selectedCorePlugin && selectedCorePlugin !== camera.pluginInfo?.name">
              <Divider class="m-0 py-3" />

              <span class="cui-label">{{ $t('components.camera_options.plugin_settings') }}</span>

              <div v-if="!coreExtensionConfig?.schema?.length" class="w-full flex items-center justify-center my-5">
                <ProgressSpinner v-if="coreExtensionConfigLoading" class="w-[30px] h-[30px] m-0" stroke-width="5" />
                <span v-else class="text-sm text-muted text-center">{{ $t('components.camera_options.no_config') }}</span>
              </div>

              <CuiSchema
                v-else
                :key="`core-plugin-${selectedCorePlugin}`"
                :schema-form="{ schema: coreExtensionConfig.schema, config: coreExtensionConfig.config }"
                :loading="configPatchLoading"
                @on-form-submit="(configData: PluginConfig) => onCorePluginFormSubmit(configData)"
                @on-submit="(state) => onCorePluginSubmit(state)"
                @on-action="(state) => onCorePluginAction(state)"
              />
            </template>

            <Divider class="m-0 py-3" />

            <span class="cui-label">{{ $t('components.camera_options.sensors') }}</span>

            <CuiChipGroup v-if="coreSensorsForType.length" v-model="selectedCoreSensorId" :disabled="isExtensionsLoading" mandatory class="min-h-[30px]">
              <CuiChip v-for="sensor in coreSensorsForType" :key="sensor.id" size="small" :disabled="configPatchLoading" :value="sensor.id">
                {{ sensor.displayName.value }}
                <template #append>
                  <Button
                    :text="selectedAccessorySensorId !== sensor.id"
                    rounded
                    :severity="selectedAccessorySensorId === sensor.id ? 'primary' : 'secondary'"
                    class="cui-icon-sm text-white"
                    @click.stop="openRenameSensorDialog(sensor)"
                  >
                    <template #icon>
                      <i-mdi:pencil width="100%" height="100%" />
                    </template>
                  </Button>
                </template>
              </CuiChip>
            </CuiChipGroup>

            <span v-else class="text-sm text-muted text-center min-h-[30px]">{{ $t('components.camera_options.no_sensors') }}</span>

            <template v-if="selectedCoreSensorId">
              <Divider class="m-0 py-3" />

              <span class="cui-label">{{ $t('components.camera_options.sensor_settings') }}</span>

              <div v-if="!selectedCoreSensorPluginName || !coreSensorConfig?.schema?.length" class="w-full flex items-center justify-center my-5">
                <ProgressSpinner v-if="coreSensorConfigLoading" class="w-[30px] h-[30px] m-0" stroke-width="5" />
                <span v-else class="text-sm text-muted text-center">{{ $t('components.camera_options.no_config') }}</span>
              </div>

              <CuiSchema
                v-else
                :key="`sensor-${selectedCoreSensorId}`"
                :schema-form="{ schema: coreSensorConfig.schema, config: coreSensorConfig.config }"
                :loading="configPatchLoading"
                @on-form-submit="(configData: PluginConfig) => onControlFormSubmit(configData)"
                @on-submit="(state) => onControlSubmit(state)"
                @on-action="(state) => onControlAction(state)"
              />
            </template>
          </template>
        </template>
      </div>

      <div v-else-if="selectedExtension === 'accessories'" class="flex flex-col gap-2">
        <template v-if="!availableAccessoryTypes.length">
          <span class="cui-label">{{ $t('components.camera_options.sensor_types') }}</span>
          <span class="text-sm text-muted text-center min-h-[30px]">{{ $t('components.camera_options.no_plugins_enabled') }}</span>
        </template>

        <template v-else>
          <span class="cui-label">{{ $t('components.camera_options.sensor_types') }}</span>

          <CuiChipGroup v-model="selectedAccessoryType" :disabled="isExtensionsLoading" mandatory class="min-h-[30px]">
            <CuiChip v-for="type in availableAccessoryTypes" :key="type" size="small" :disabled="configPatchLoading" :value="type">
              {{ $t(`components.camera_options.sensor_type_${type}`) }}
            </CuiChip>
          </CuiChipGroup>

          <template v-if="accessoryPluginsForType.length">
            <Divider class="m-0 py-3" />

            <span class="cui-label">{{ $t('components.camera_options.chip_plugins') }}</span>

            <CuiChipGroup
              :model-value="isAccessorySingleProvider ? assignedAccessoryPlugins[0] : assignedAccessoryPlugins"
              :disabled="isExtensionsLoading"
              :multiple="!isAccessorySingleProvider"
              class="min-h-[30px]"
              @update:model-value="onAccessoryPluginsChange"
            >
              <CuiChip
                v-for="extension in accessoryPluginsForType"
                :key="extension.pluginName"
                size="small"
                filter
                :disabled="!isPluginEnabled(extension.pluginName) || configPatchLoading"
                :value="extension.pluginName"
              >
                {{ extension.displayName }}
              </CuiChip>
            </CuiChipGroup>

            <template v-if="selectedAccessoryPluginForConfig && selectedAccessoryPluginForConfig !== camera.pluginInfo?.name">
              <Divider class="m-0 py-3" />

              <span class="cui-label">{{ $t('components.camera_options.plugin_settings') }}</span>

              <div v-if="!accessoryExtensionConfig?.schema?.length" class="w-full flex items-center justify-center my-5">
                <ProgressSpinner v-if="accessoryExtensionConfigLoading" class="w-[30px] h-[30px] m-0" stroke-width="5" />
                <span v-else class="text-sm text-muted text-center">{{ $t('components.camera_options.no_config') }}</span>
              </div>

              <CuiSchema
                v-else
                :key="`accessory-plugin-${selectedAccessoryPluginForConfig}`"
                :schema-form="{ schema: accessoryExtensionConfig.schema, config: accessoryExtensionConfig.config }"
                :loading="configPatchLoading"
                @on-form-submit="(configData: PluginConfig) => onAccessoryPluginFormSubmit(configData)"
                @on-submit="(state) => onAccessoryPluginSubmit(state)"
                @on-action="(state) => onAccessoryPluginAction(state)"
              />
            </template>
          </template>

          <Divider class="m-0 py-3" />

          <span class="cui-label">{{ $t('components.camera_options.sensors') }}</span>

          <CuiChipGroup v-if="accessorySensorsForType.length" v-model="selectedAccessorySensorId" :disabled="isExtensionsLoading" mandatory class="min-h-[30px]">
            <CuiChip v-for="sensor in accessorySensorsForType" :key="sensor.id" size="small" :disabled="configPatchLoading" :value="sensor.id">
              {{ sensor.displayName.value }}
              <template #append>
                <Button
                  :text="selectedAccessorySensorId !== sensor.id"
                  rounded
                  :severity="selectedAccessorySensorId === sensor.id ? 'primary' : 'secondary'"
                  class="cui-icon-sm text-white"
                  @click.stop="openRenameSensorDialog(sensor)"
                >
                  <template #icon>
                    <i-mdi:pencil width="100%" height="100%" />
                  </template>
                </Button>
              </template>
            </CuiChip>
          </CuiChipGroup>

          <span v-else class="text-sm text-muted text-center min-h-[30px]">{{ $t('components.camera_options.no_sensors') }}</span>

          <template v-if="selectedAccessorySensorId">
            <Divider class="m-0 py-3" />

            <span class="cui-label">{{ $t('components.camera_options.sensor_settings') }}</span>

            <div v-if="!selectedAccessoryPluginName || !sensorConfig?.schema?.length" class="w-full flex items-center justify-center my-5">
              <ProgressSpinner v-if="sensorConfigLoading" class="w-[30px] h-[30px] m-0" stroke-width="5" />
              <span v-else class="text-sm text-muted text-center">{{ $t('components.camera_options.no_config') }}</span>
            </div>

            <CuiSchema
              v-else
              :key="`sensor-${selectedAccessorySensorId}`"
              :schema-form="{ schema: sensorConfig.schema, config: sensorConfig.config }"
              :loading="configPatchLoading"
              @on-form-submit="(configData: PluginConfig) => onAccessoryFormSubmit(configData)"
              @on-submit="(state) => onAccessorySubmit(state)"
              @on-action="(state) => onAccessoryAction(state)"
            />
          </template>
        </template>
      </div>

      <div v-else-if="selectedExtension === 'more'" class="flex flex-col gap-2">
        <span class="cui-label">{{ $t('components.camera_options.manage_plugins') }}</span>

        <div v-if="extensionsListLoading || !filteredExtensions.length" class="w-full flex items-center justify-center">
          <ProgressSpinner v-if="extensionsListLoading" class="w-[30px] h-[30px] m-0" stroke-width="5" />
          <span v-else class="text-sm text-muted text-center">{{ $t('components.camera_options.no_plugins_found') }}</span>
        </div>

        <div v-else class="w-full h-full">
          <div
            v-for="filteredCameraExtension in filteredExtensions"
            :key="filteredCameraExtension.pluginName"
            v-tooltip.top="{ value: isPluginEnabled(filteredCameraExtension.pluginName) === undefined ? $t('components.form.tooltip.disabled') : '' }"
            class="cui-list-item"
          >
            <CuiListItem
              :disabled="isExtensionsLoading || !isPluginEnabled(filteredCameraExtension.pluginName)"
              class="h-14"
              @click="$router.push(`/plugins/${filteredCameraExtension.pluginName}`)"
            >
              <span>{{ filteredCameraExtension.displayName }}</span>

              <template #append>
                <ToggleSwitch
                  :model-value="cameraExtensions?.some((plugin: PluginExtension) => plugin.pluginName === filteredCameraExtension.pluginName)"
                  :disabled="isExtensionsLoading || !isPluginEnabled(filteredCameraExtension.pluginName)"
                  @update:model-value="toggleExtension(filteredCameraExtension)"
                />
              </template>
            </CuiListItem>
          </div>
        </div>

        <div class="cui-list-item">
          <CuiListItem class="h-14" @click="$router.push(`/plugins`)">
            <span>{{ $t('components.camera_options.more_plugins') }}</span>
            <template #append>
              <Button text rounded severity="secondary" class="cui-icon-md">
                <template #icon>
                  <i-majesticons:open width="100%" height="100%" />
                </template>
              </Button>
            </template>
          </CuiListItem>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { useCameraStorage, useSensors, useSensorStorage } from '@camera.ui/browser';
import { canCreateCameras, canProvideSensorsToAnyCameras, isHub, SensorType } from '@camera.ui/sdk';
import { getAccessorySensorTypes, getAssignmentKey, getCoreSensorTypes, getDetectionSensorTypes, isSingleProviderType } from '@shared/types';

import { CamerasQuery } from '@/api/routes/cameras.js';
import { PluginsQuery } from '@/api/routes/plugins.js';
import { pluginMessageResponseTypeToToastType } from '@/common/utils.js';
import PluginSchemaDialog from '@/components/CuiDialog/templates/PluginSchema/PluginSchema.vue';
import RenameSensorDialog from '@/components/CuiDialog/templates/RenameSensor/RenameSensor.vue';
import CuiSchema from '@/components/CuiSchema/CuiSchema.vue';

import type { PluginSchemaProps } from '@/components/CuiDialog/templates/PluginSchema/types.js';
import type { ReactiveSensor } from '@camera.ui/browser';
import type { AssignedPlugin, PluginConfig } from '@camera.ui/sdk';
import type { PluginExtension } from '@shared/types';
import type { CameraOptionsTabEmits, CameraOptionsTabProps } from '../../types.js';

type ExtensionTypes = 'hub' | 'detection' | 'core' | 'accessories' | 'cameraController' | 'more';

const DETECTION_SENSOR_TYPES = getDetectionSensorTypes();
const CORE_SENSOR_TYPES = getCoreSensorTypes();
const ACCESSORIES_SENSOR_TYPES = getAccessorySensorTypes();

const camerasQuery = new CamerasQuery();
const pluginsQuery = new PluginsQuery();

const props = defineProps<CameraOptionsTabProps>();

defineEmits<CameraOptionsTabEmits>();

const toast = useCuiToast();
const dialog = useCuiDialog();
const { t } = useI18n();
const { camera, cameraDevice, loading } = toRefs(props);

const { data: plugins, isBusy: pluginsLoading } = pluginsQuery.getPluginsQuery({ page: 1, pageSize: -1 });
const { data: cameraExtensions, isBusy: cameraExtensionsLoading, suspense: cameraExtensionsSuspense } = camerasQuery.getCameraExtensionsQuery(camera.value.name);
const { data: registeredSensors, isBusy: registeredSensorsLoading } = camerasQuery.getCameraRegisteredSensorsQuery(camera.value.name);
const { data: extensionsList, isBusy: extensionsListLoading } = pluginsQuery.getPluginsExtensionsQuery({ page: 1, pageSize: -1 });
const { mutateAsync: enableExtension, isPending: enableExtensionPending } = camerasQuery.enableCameraExtensionQuery();
const { mutateAsync: disableExtension, isPending: disableExtensionPending } = camerasQuery.disableCameraExtensionQuery();
const { mutateAsync: activateExtension, isPending: activateExtensionPending } = camerasQuery.activateCameraExtensionQuery();
const { mutateAsync: deactivateExtension, isPending: deactivateExtensionPending } = camerasQuery.deactivateCameraExtensionQuery();

const { sensors: allSensors } = useSensors(cameraDevice);

const schemaRef = useTemplateRef<InstanceType<typeof CuiSchema>>('schemaRef');
const selectedExtension = ref<ExtensionTypes>('hub');
const extensionTypes = ref<ExtensionTypes[]>(['hub', 'detection', 'core', 'accessories', 'more']);
const selectedPlugin = ref('');
const selectedHubPlugin = ref<string>();
const selectedDetectionType = ref<SensorType>();
const selectedDetectionPlugin = ref<string>();
const selectedCoreType = ref<SensorType>();
const selectedCorePlugin = ref<string>();
const selectedAccessoryType = ref<SensorType>();
const selectedAccessorySensorId = ref<string>();
const selectedDetectionSensorId = ref<string>();
const selectedCoreSensorId = ref<string>();
const selectedAccessoryPluginForConfig = ref<string>();

const selectedAccessoryPluginName = computed(() => {
  if (!selectedAccessorySensorId.value) return '';
  const sensor = accessorySensorsForType.value.find((s) => s.id === selectedAccessorySensorId.value);
  if (!sensor?.pluginId) return '';
  return getPluginNameFromId(sensor.pluginId) || '';
});

const selectedAccessoryPluginId = computed(() => {
  if (!selectedAccessorySensorId.value) return '';
  const sensor = accessorySensorsForType.value.find((s) => s.id === selectedAccessorySensorId.value);
  return sensor?.pluginId || '';
});

const accessoriesExtensions = computed<PluginExtension[]>(() => {
  return cameraExtensions.value?.filter((p) => ACCESSORIES_SENSOR_TYPES.some((type: SensorType) => p.contract.provides.includes(type))) || [];
});

const availableAccessoryTypes = computed<SensorType[]>(() => {
  const types = new Set<SensorType>();
  for (const ext of accessoriesExtensions.value) {
    for (const type of ACCESSORIES_SENSOR_TYPES) {
      if (ext.contract.provides.includes(type)) {
        types.add(type);
      }
    }
  }
  return Array.from(types)
    .filter(typeHasContent)
    .sort((a, b) => {
      const labelA = t(`components.camera_options.sensor_type_${a}`);
      const labelB = t(`components.camera_options.sensor_type_${b}`);
      return labelA.localeCompare(labelB);
    });
});

const accessoryPluginsForType = computed<PluginExtension[]>(() => {
  const type = selectedAccessoryType.value;
  if (!type) return [];
  const ex = cameraExtensions.value?.filter((p) => p.contract.provides.includes(type) && pluginProvidesTypeHere(p, type)) || [];
  return sortExtensions(ex);
});

const isAccessorySingleProvider = computed(() => (selectedAccessoryType.value ? isSingleProviderType(selectedAccessoryType.value) : false));

const assignedAccessoryPlugins = computed<string[]>(() => {
  if (!selectedAccessoryType.value) return [];
  const key = getAssignmentKey(selectedAccessoryType.value) as keyof typeof camera.value.assignments;
  const assignments = camera.value.assignments[key];
  let pluginNames: string[] = [];

  if (Array.isArray(assignments)) {
    // Multi-provider: return all assigned plugin names
    pluginNames = assignments.map((a) => a.name);
  } else if (assignments && typeof assignments === 'object' && 'name' in assignments) {
    // Single-provider: return as single-element array
    pluginNames = [assignments.name];
  }

  // Sort to match the order of accessoryPluginsForType
  const pluginOrder = accessoryPluginsForType.value.map((p) => p.pluginName);
  return pluginNames.sort((a, b) => pluginOrder.indexOf(a) - pluginOrder.indexOf(b));
});

const accessorySensorsForType = computed<ReactiveSensor[]>(() => {
  return allSensors.value.filter((s) => s.type === selectedAccessoryType.value).sort((a, b) => a.displayName.value.localeCompare(b.displayName.value));
});

const extensionStorage = useCameraStorage(cameraDevice, selectedPlugin);
const extensionConfig = extensionStorage.config;
const extensionConfigLoading = extensionStorage.isLoading;

const sensorStorage = useSensorStorage(cameraDevice, selectedAccessorySensorId, selectedAccessoryPluginId);
const sensorConfig = sensorStorage.config;
const sensorConfigLoading = sensorStorage.isLoading;

const categoriesLoading = computed(() => pluginsLoading.value || extensionsListLoading.value || cameraExtensionsLoading.value || registeredSensorsLoading.value);

const isExtensionsLoading = computed(
  () =>
    cameraExtensionsLoading.value ||
    extensionsListLoading.value ||
    enableExtensionPending.value ||
    disableExtensionPending.value ||
    activateExtensionPending.value ||
    deactivateExtensionPending.value,
);

const configPatchLoading = computed(
  () =>
    isExtensionsLoading.value ||
    loading.value ||
    extensionStorage.isLoading.value ||
    sensorStorage.isLoading.value ||
    detectionExtensionStorage.isLoading.value ||
    detectionSensorStorage.isLoading.value ||
    coreExtensionStorage.isLoading.value ||
    coreSensorStorage.isLoading.value ||
    accessoryExtensionStorage.isLoading.value,
);

const cameraControllerExtension = computed<PluginExtension | undefined>(() => {
  const ex = extensionsList.value?.result.filter((p) => canCreateCameras(p.contract) && p.pluginName === camera.value.pluginInfo?.name) || [];
  return ex[0];
});

const hubExtensions = computed<PluginExtension[]>(() => {
  const ex = cameraExtensions.value?.filter((p) => isHub(p.contract)) || [];
  return sortExtensions(ex);
});

const cameraTabPlugins = computed<PluginExtension[]>(() => {
  if (cameraControllerExtension.value && isPluginEnabled(cameraControllerExtension.value.pluginName)) {
    return [cameraControllerExtension.value];
  }
  return [];
});

const detectionExtensions = computed<PluginExtension[]>(() => {
  return cameraExtensions.value?.filter((p) => DETECTION_SENSOR_TYPES.some((type: SensorType) => p.contract.provides.includes(type))) || [];
});

const availableDetectionTypes = computed<SensorType[]>(() => {
  const types = new Set<SensorType>();
  for (const ext of detectionExtensions.value) {
    for (const type of DETECTION_SENSOR_TYPES) {
      if (ext.contract.provides.includes(type)) {
        types.add(type);
      }
    }
  }
  return Array.from(types)
    .filter(typeHasContent)
    .sort((a, b) => {
      const labelA = t(`components.camera_options.sensor_type_${a}`);
      const labelB = t(`components.camera_options.sensor_type_${b}`);
      return labelA.localeCompare(labelB);
    });
});

const detectionPluginsForType = computed<PluginExtension[]>(() => {
  const type = selectedDetectionType.value;
  if (!type) return [];
  const ex = cameraExtensions.value?.filter((p) => p.contract.provides.includes(type) && pluginProvidesTypeHere(p, type)) || [];
  return sortExtensions(ex);
});

const detectionSensorsForType = computed<ReactiveSensor[]>(() => {
  return allSensors.value.filter((s) => s.type === selectedDetectionType.value).sort((a, b) => a.displayName.value.localeCompare(b.displayName.value));
});

const selectedDetectionSensorPluginName = computed(() => {
  if (!selectedDetectionSensorId.value) return '';
  const sensor = detectionSensorsForType.value.find((s) => s.id === selectedDetectionSensorId.value);
  if (!sensor?.pluginId) return '';
  return getPluginNameFromId(sensor.pluginId) || '';
});

const selectedDetectionSensorPluginId = computed(() => {
  if (!selectedDetectionSensorId.value) return '';
  const sensor = detectionSensorsForType.value.find((s) => s.id === selectedDetectionSensorId.value);
  return sensor?.pluginId || '';
});

const coreExtensions = computed<PluginExtension[]>(() => {
  return cameraExtensions.value?.filter((p) => CORE_SENSOR_TYPES.some((type: SensorType) => p.contract.provides.includes(type))) || [];
});

const availableCoreTypes = computed<SensorType[]>(() => {
  const types = new Set<SensorType>();
  for (const ext of coreExtensions.value) {
    for (const type of CORE_SENSOR_TYPES) {
      if (ext.contract.provides.includes(type)) {
        types.add(type);
      }
    }
  }
  return Array.from(types)
    .filter(typeHasContent)
    .sort((a, b) => {
      const labelA = t(`components.camera_options.sensor_type_${a}`);
      const labelB = t(`components.camera_options.sensor_type_${b}`);
      return labelA.localeCompare(labelB);
    });
});

const corePluginsForType = computed<PluginExtension[]>(() => {
  const type = selectedCoreType.value;
  if (!type) return [];
  const ex = cameraExtensions.value?.filter((p) => p.contract.provides.includes(type) && pluginProvidesTypeHere(p, type)) || [];
  return sortExtensions(ex);
});

const coreSensorsForType = computed<ReactiveSensor[]>(() => {
  return allSensors.value.filter((s) => s.type === selectedCoreType.value).sort((a, b) => a.displayName.value.localeCompare(b.displayName.value));
});

const selectedCoreSensorPluginName = computed(() => {
  if (!selectedCoreSensorId.value) return '';
  const sensor = coreSensorsForType.value.find((s) => s.id === selectedCoreSensorId.value);
  if (!sensor?.pluginId) return '';
  return getPluginNameFromId(sensor.pluginId) || '';
});

const selectedCoreSensorPluginId = computed(() => {
  if (!selectedCoreSensorId.value) return '';
  const sensor = coreSensorsForType.value.find((s) => s.id === selectedCoreSensorId.value);
  return sensor?.pluginId || '';
});

const selectedDetectionPluginName = computed(() => selectedDetectionPlugin.value ?? '');
const detectionExtensionStorage = useCameraStorage(cameraDevice, selectedDetectionPluginName);
const detectionExtensionConfig = detectionExtensionStorage.config;
const detectionExtensionConfigLoading = detectionExtensionStorage.isLoading;

const detectionSensorStorage = useSensorStorage(cameraDevice, selectedDetectionSensorId, selectedDetectionSensorPluginId);
const detectionSensorConfig = detectionSensorStorage.config;
const detectionSensorConfigLoading = detectionSensorStorage.isLoading;

const selectedCorePluginName = computed(() => selectedCorePlugin.value ?? '');
const coreExtensionStorage = useCameraStorage(cameraDevice, selectedCorePluginName);
const coreExtensionConfig = coreExtensionStorage.config;
const coreExtensionConfigLoading = coreExtensionStorage.isLoading;

const coreSensorStorage = useSensorStorage(cameraDevice, selectedCoreSensorId, selectedCoreSensorPluginId);
const coreSensorConfig = coreSensorStorage.config;
const coreSensorConfigLoading = coreSensorStorage.isLoading;

const selectedAccessoryPluginForConfigName = computed(() => selectedAccessoryPluginForConfig.value ?? '');
const accessoryExtensionStorage = useCameraStorage(cameraDevice, selectedAccessoryPluginForConfigName);
const accessoryExtensionConfig = accessoryExtensionStorage.config;
const accessoryExtensionConfigLoading = accessoryExtensionStorage.isLoading;

const filteredExtensions = computed<PluginExtension[]>(() => {
  const _plugins = plugins.value?.result || [];
  const _extensions = extensionsList.value?.result || [];
  return _extensions.filter((extension) => {
    const plugin = _plugins.find((p) => p.pluginName === extension.pluginName);
    const hasProvides = extension.contract.provides.length > 0;
    const hasConsumes = extension.contract.consumes.length > 0;

    const isThisCamerasController = camera.value.pluginInfo?.name === extension.pluginName;
    if (isThisCamerasController) return false;
    if (canCreateCameras(extension.contract) && !canProvideSensorsToAnyCameras(extension.contract)) {
      return false;
    }

    return plugin && (hasProvides || hasConsumes || isHub(extension.contract));
  });
});

function pluginProvidesTypeHere(p: PluginExtension, type: SensorType): boolean {
  if (p.pluginName !== camera.value.pluginInfo?.name) return true;
  return (registeredSensors.value ?? []).some((s) => s.type === type && getPluginNameFromId(s.pluginId || '') === p.pluginName);
}

function typeHasContent(type: SensorType): boolean {
  if (allSensors.value.some((s) => s.type === type)) return true;
  if ((registeredSensors.value ?? []).some((s) => s.type === type)) return true;
  return (cameraExtensions.value ?? []).some((p) => p.contract.provides.includes(type) && p.pluginName !== camera.value.pluginInfo?.name);
}

function getPluginNameFromId(pluginId: string): string | undefined {
  return camera.value.plugins.find((p) => p.id === pluginId)?.name;
}

function isPluginEnabled(extension?: AssignedPlugin | string): string | undefined {
  const name = typeof extension === 'string' ? extension : extension?.name;
  if (name && plugins.value && plugins.value.result.some((plugin) => plugin.pluginName === name && !plugin.disabled)) {
    return name;
  }
}

function sortExtensions(extensions: PluginExtension[]): PluginExtension[] {
  return extensions.sort((a, b) => {
    if (!isPluginEnabled(a.pluginName) && isPluginEnabled(b.pluginName)) {
      return 1;
    } else if (isPluginEnabled(a.pluginName) && !isPluginEnabled(b.pluginName)) {
      return -1;
    } else {
      return a.displayName.localeCompare(b.displayName);
    }
  });
}

function getDetectionAssignment(type: SensorType): AssignedPlugin | undefined {
  const key = getAssignmentKey(type) as keyof typeof camera.value.assignments;
  const assignment = camera.value.assignments[key];
  return Array.isArray(assignment) ? undefined : assignment;
}

function getCoreAssignment(type: SensorType): AssignedPlugin | undefined {
  const key = getAssignmentKey(type) as keyof typeof camera.value.assignments;
  const assignment = camera.value.assignments[key];
  return Array.isArray(assignment) ? undefined : assignment;
}

async function updateSelectedPlugin(pluginName?: string): Promise<void> {
  if (pluginName !== undefined) {
    selectedPlugin.value = pluginName;
  } else {
    switch (selectedExtension.value) {
      case 'cameraController':
        selectedPlugin.value = isPluginEnabled(cameraControllerExtension.value?.pluginName) || '';
        break;
      case 'hub':
        selectedPlugin.value = isPluginEnabled(hubExtensions.value[0]?.pluginName) || '';
        break;
      case 'detection': {
        const assignment = selectedDetectionType.value ? getDetectionAssignment(selectedDetectionType.value) : undefined;
        const assignedPluginName = isPluginEnabled(assignment);
        selectedPlugin.value = assignedPluginName || '';
        // Sync selectedDetectionPlugin so the chip shows as checked
        selectedDetectionPlugin.value = assignedPluginName || undefined;
        break;
      }
      case 'core': {
        const assignment = selectedCoreType.value ? getCoreAssignment(selectedCoreType.value) : undefined;
        const assignedPluginName = isPluginEnabled(assignment);
        selectedPlugin.value = assignedPluginName || '';
        // Sync selectedCorePlugin so the chip shows as checked
        selectedCorePlugin.value = assignedPluginName || undefined;
        break;
      }
      case 'accessories':
        // For accessories, we use sensorConfig not extensionConfig
        selectedPlugin.value = '';
        break;
      default:
        selectedPlugin.value = '';
        break;
    }
  }

  // Fetch config if a plugin is selected (excluding accessories which use sensor storage)
  if (selectedPlugin.value && selectedExtension.value !== 'accessories' && isPluginEnabled(selectedPlugin.value)) {
    await extensionStorage.getConfig();
  }
}

function initCategorySelection(): void {
  switch (selectedExtension.value) {
    case 'cameraController':
      // Auto-select first plugin from cameraTabPlugins
      if (cameraTabPlugins.value.length && !selectedPlugin.value) {
        selectedPlugin.value = cameraTabPlugins.value[0].pluginName;
      }
      break;
    case 'hub':
      if (hubExtensions.value.length) {
        const firstEnabled = hubExtensions.value.find((e) => isPluginEnabled(e.pluginName));
        selectedHubPlugin.value = firstEnabled?.pluginName;
      }
      break;
    case 'detection': {
      // Set first available detection type if none selected or invalid
      if (availableDetectionTypes.value.length && (!selectedDetectionType.value || !availableDetectionTypes.value.includes(selectedDetectionType.value))) {
        selectedDetectionType.value = availableDetectionTypes.value[0];
      }
      // Set selected plugin based on current assignment
      const assignment = selectedDetectionType.value ? getDetectionAssignment(selectedDetectionType.value) : undefined;
      if (assignment && isPluginEnabled(assignment.name)) {
        selectedDetectionPlugin.value = assignment.name;
      } else {
        selectedDetectionPlugin.value = undefined;
      }
      // Auto-select first sensor (use nextTick for async sensor loading)
      nextTick(() => {
        if (detectionSensorsForType.value.length && !selectedDetectionSensorId.value) {
          selectedDetectionSensorId.value = detectionSensorsForType.value[0].id;
        }
      });
      break;
    }
    case 'core': {
      // Set first available control type if none selected or invalid
      if (availableCoreTypes.value.length && (!selectedCoreType.value || !availableCoreTypes.value.includes(selectedCoreType.value))) {
        selectedCoreType.value = availableCoreTypes.value[0];
      }
      // Set selected plugin based on current assignment
      const controlAssignment = selectedCoreType.value ? getCoreAssignment(selectedCoreType.value) : undefined;
      if (controlAssignment && isPluginEnabled(controlAssignment.name)) {
        selectedCorePlugin.value = controlAssignment.name;
      } else {
        selectedCorePlugin.value = undefined;
      }
      // Auto-select first sensor (use nextTick for async sensor loading)
      nextTick(() => {
        if (coreSensorsForType.value.length && !selectedCoreSensorId.value) {
          selectedCoreSensorId.value = coreSensorsForType.value[0].id;
        }
      });
      break;
    }
    case 'accessories':
      // Set first available accessory type if none selected or invalid
      if (availableAccessoryTypes.value.length && (!selectedAccessoryType.value || !availableAccessoryTypes.value.includes(selectedAccessoryType.value))) {
        selectedAccessoryType.value = availableAccessoryTypes.value[0];
      }
      // Set plugin for config (first assigned plugin for this type)
      nextTick(() => {
        if (assignedAccessoryPlugins.value.length && !selectedAccessoryPluginForConfig.value) {
          selectedAccessoryPluginForConfig.value = assignedAccessoryPlugins.value[0];
        }
      });
      // Auto-select first sensor of the selected type (use nextTick for async sensor loading)
      nextTick(() => {
        if (accessorySensorsForType.value.length && !selectedAccessorySensorId.value) {
          selectedAccessorySensorId.value = accessorySensorsForType.value[0].id;
        }
      });
      break;
  }
}

async function toggleExtension(extension: PluginExtension): Promise<void> {
  if (cameraExtensions.value) {
    const isActive = cameraExtensions.value.some((p) => p.pluginName === extension.pluginName);

    if (isActive) {
      // Deactivate: single API call removes plugin and all assignments
      await deactivateExtension({ cameraname: camera.value.name, pluginname: extension.pluginName });
      schemaRef.value?.reset();
    } else {
      // Activate: single API call adds plugin and enables all assignments
      await activateExtension({ cameraname: camera.value.name, pluginname: extension.pluginName });
    }
  }
}

async function onAccessoryPluginsChange(value: string | number | object | undefined): Promise<void> {
  if (!selectedAccessoryType.value) return;

  const oldSelection = assignedAccessoryPlugins.value;

  // Handle single-provider mode (value is string or undefined)
  if (isAccessorySingleProvider.value) {
    const newPlugin = value as string | undefined;
    const oldPlugin = oldSelection[0];

    if (newPlugin === oldPlugin) return;

    if (oldPlugin) {
      await disableExtension({
        cameraname: camera.value.name,
        pluginname: oldPlugin,
        type: selectedAccessoryType.value,
      });
      selectedAccessorySensorId.value = undefined;
    }

    if (newPlugin) {
      await enableExtension({
        cameraname: camera.value.name,
        pluginname: newPlugin,
        type: selectedAccessoryType.value,
      });
      // Set plugin for config
      selectedAccessoryPluginForConfig.value = newPlugin;
    } else {
      selectedAccessoryPluginForConfig.value = undefined;
    }
    return;
  }

  // Multi-provider mode (value is array)
  const newSelection = (value as string[]) || [];

  const added = newSelection.filter((p) => !oldSelection.includes(p));
  const removed = oldSelection.filter((p) => !newSelection.includes(p));

  for (const pluginName of added) {
    await enableExtension({
      cameraname: camera.value.name,
      pluginname: pluginName,
      type: selectedAccessoryType.value,
    });
  }

  for (const pluginName of removed) {
    await disableExtension({
      cameraname: camera.value.name,
      pluginname: pluginName,
      type: selectedAccessoryType.value,
    });

    // Reset sensor selection if we disabled the plugin that owns the currently selected sensor
    if (selectedAccessorySensorId.value) {
      const sensor = accessorySensorsForType.value.find((s) => s.id === selectedAccessorySensorId.value);
      if (sensor && getPluginNameFromId(sensor.pluginId || '') === pluginName) {
        selectedAccessorySensorId.value = undefined;
      }
    }

    // Reset plugin for config if we disabled it
    if (selectedAccessoryPluginForConfig.value === pluginName) {
      selectedAccessoryPluginForConfig.value = undefined;
    }
  }

  // Set plugin for config (first assigned plugin or newly added)
  if (added.length && !selectedAccessoryPluginForConfig.value) {
    selectedAccessoryPluginForConfig.value = added[0];
  } else if (newSelection.length && !selectedAccessoryPluginForConfig.value) {
    selectedAccessoryPluginForConfig.value = newSelection[0];
  }
}

async function onAction(state: { key: string }, _pluginName: string): Promise<void> {
  try {
    await extensionStorage.setValue(state.key, undefined);
    toast.add({ severity: 'success', detail: t('components.toast.config_updated'), life: 3000 });
  } catch (error) {
    toast.add({ severity: 'error', detail: error, life: 3000 });
  }
}

async function onSubmit(state: { key: string; payload: any }, pluginName: string): Promise<void> {
  try {
    const response = await extensionStorage.submitValue(state.key, state.payload);
    if (response?.toast) {
      const type = pluginMessageResponseTypeToToastType(response.toast.type);
      toast.add({ severity: type, detail: response.toast.message, life: 3000 });
    }
    if (response?.schema && response.schema.length) {
      dialog.openComponentDialog<PluginSchemaProps>(PluginSchemaDialog, {
        data: {
          title: t('components.dialog.title.config'),
          hideConfirmButton: true,
          contentProps: {
            schemaConfig: { schema: response.schema, config: state.payload },
            pluginName,
            cameraName: camera.value.name,
            buttonKey: state.key,
          },
        },
      });
    }
  } catch (error) {
    toast.add({ severity: 'error', detail: error, life: 3000 });
  }
}

async function onFormSubmit(_pluginname: string, configData: Record<string, any>): Promise<void> {
  try {
    await extensionStorage.setConfig(configData);
    toast.add({ severity: 'success', detail: t('components.toast.config_updated'), life: 3000 });
  } catch (error) {
    toast.add({ severity: 'error', detail: error, life: 3000 });
  }
}

async function onDetectionAction(state: { key: string }): Promise<void> {
  if (!selectedDetectionSensorPluginId.value || !selectedDetectionSensorId.value) return;
  try {
    await detectionSensorStorage.setValue(state.key, undefined);
    toast.add({ severity: 'success', detail: t('components.toast.config_updated'), life: 3000 });
  } catch (error) {
    toast.add({ severity: 'error', detail: error, life: 3000 });
  }
}

async function onDetectionSubmit(state: { key: string; payload: any }): Promise<void> {
  if (!selectedDetectionSensorPluginId.value || !selectedDetectionSensorId.value) return;
  try {
    const response = await detectionSensorStorage.submitValue(state.key, state.payload);
    if (response?.toast) {
      const type = pluginMessageResponseTypeToToastType(response.toast.type);
      toast.add({ severity: type, detail: response.toast.message, life: 3000 });
    }
  } catch (error) {
    toast.add({ severity: 'error', detail: error, life: 3000 });
  }
}

async function onDetectionFormSubmit(configData: Record<string, any>): Promise<void> {
  if (!selectedDetectionSensorPluginId.value || !selectedDetectionSensorId.value) return;
  try {
    await detectionSensorStorage.setConfig(configData);
    toast.add({ severity: 'success', detail: t('components.toast.config_updated'), life: 3000 });
  } catch (error) {
    toast.add({ severity: 'error', detail: error, life: 3000 });
  }
}

async function onControlAction(state: { key: string }): Promise<void> {
  if (!selectedCoreSensorPluginId.value || !selectedCoreSensorId.value) return;
  try {
    await coreSensorStorage.setValue(state.key, undefined);
    toast.add({ severity: 'success', detail: t('components.toast.config_updated'), life: 3000 });
  } catch (error) {
    toast.add({ severity: 'error', detail: error, life: 3000 });
  }
}

async function onControlSubmit(state: { key: string; payload: any }): Promise<void> {
  if (!selectedCoreSensorPluginId.value || !selectedCoreSensorId.value) return;
  try {
    const response = await coreSensorStorage.submitValue(state.key, state.payload);
    if (response?.toast) {
      const type = pluginMessageResponseTypeToToastType(response.toast.type);
      toast.add({ severity: type, detail: response.toast.message, life: 3000 });
    }
  } catch (error) {
    toast.add({ severity: 'error', detail: error, life: 3000 });
  }
}

async function onControlFormSubmit(configData: Record<string, any>): Promise<void> {
  if (!selectedCoreSensorPluginId.value || !selectedCoreSensorId.value) return;
  try {
    await coreSensorStorage.setConfig(configData);
    toast.add({ severity: 'success', detail: t('components.toast.config_updated'), life: 3000 });
  } catch (error) {
    toast.add({ severity: 'error', detail: error, life: 3000 });
  }
}

async function onAccessoryAction(state: { key: string }): Promise<void> {
  if (!selectedAccessoryPluginId.value || !selectedAccessorySensorId.value) return;
  try {
    await sensorStorage.setValue(state.key, undefined);
    toast.add({ severity: 'success', detail: t('components.toast.config_updated'), life: 3000 });
  } catch (error) {
    toast.add({ severity: 'error', detail: error, life: 3000 });
  }
}

async function onAccessorySubmit(state: { key: string; payload: any }): Promise<void> {
  if (!selectedAccessoryPluginId.value || !selectedAccessorySensorId.value) return;
  try {
    const response = await sensorStorage.submitValue(state.key, state.payload);
    if (response?.toast) {
      const type = pluginMessageResponseTypeToToastType(response.toast.type);
      toast.add({ severity: type, detail: response.toast.message, life: 3000 });
    }
    if (response?.schema && response.schema.length) {
      dialog.openComponentDialog<PluginSchemaProps>(PluginSchemaDialog, {
        data: {
          title: t('components.dialog.title.config'),
          hideConfirmButton: true,
          contentProps: {
            schemaConfig: { schema: response.schema, config: state.payload },
            pluginName: selectedAccessoryPluginName.value,
            cameraName: camera.value.name,
            buttonKey: state.key,
            sensorId: selectedAccessorySensorId.value,
            pluginId: selectedAccessoryPluginId.value,
          },
        },
      });
    }
  } catch (error) {
    toast.add({ severity: 'error', detail: error, life: 3000 });
  }
}

async function onAccessoryFormSubmit(configData: Record<string, any>): Promise<void> {
  if (!selectedAccessoryPluginId.value || !selectedAccessorySensorId.value) return;
  try {
    await sensorStorage.setConfig(configData);
    toast.add({ severity: 'success', detail: t('components.toast.config_updated'), life: 3000 });
  } catch (error) {
    toast.add({ severity: 'error', detail: error, life: 3000 });
  }
}

async function onDetectionPluginAction(state: { key: string }): Promise<void> {
  if (!selectedDetectionPlugin.value) return;
  await detectionExtensionStorage.setValue(state.key, undefined);
}

async function onDetectionPluginSubmit(state: { key: string; payload: any }): Promise<void> {
  if (!selectedDetectionPlugin.value) return;
  try {
    const response = await detectionExtensionStorage.submitValue(state.key, state.payload);
    if (response?.toast) {
      const type = pluginMessageResponseTypeToToastType(response.toast.type);
      toast.add({ severity: type, detail: response.toast.message, life: 3000 });
    }
    if (response?.schema && response.schema.length) {
      dialog.openComponentDialog<PluginSchemaProps>(PluginSchemaDialog, {
        data: {
          title: t('components.dialog.title.config'),
          hideConfirmButton: true,
          contentProps: {
            schemaConfig: { schema: response.schema, config: state.payload },
            pluginName: selectedDetectionPlugin.value,
            cameraName: camera.value.name,
            buttonKey: state.key,
          },
        },
      });
    }
  } catch (error) {
    toast.add({ severity: 'error', detail: error, life: 3000 });
  }
}

async function onDetectionPluginFormSubmit(configData: Record<string, any>): Promise<void> {
  if (!selectedDetectionPlugin.value) return;
  await detectionExtensionStorage.setConfig(configData);
}

async function onCorePluginAction(state: { key: string }): Promise<void> {
  if (!selectedCorePlugin.value) return;
  await coreExtensionStorage.setValue(state.key, undefined);
}

async function onCorePluginSubmit(state: { key: string; payload: any }): Promise<void> {
  if (!selectedCorePlugin.value) return;
  try {
    const response = await coreExtensionStorage.submitValue(state.key, state.payload);
    if (response?.toast) {
      const type = pluginMessageResponseTypeToToastType(response.toast.type);
      toast.add({ severity: type, detail: response.toast.message, life: 3000 });
    }
    if (response?.schema && response.schema.length) {
      dialog.openComponentDialog<PluginSchemaProps>(PluginSchemaDialog, {
        data: {
          title: t('components.dialog.title.config'),
          hideConfirmButton: true,
          contentProps: {
            schemaConfig: { schema: response.schema, config: state.payload },
            pluginName: selectedCorePlugin.value,
            cameraName: camera.value.name,
            buttonKey: state.key,
          },
        },
      });
    }
  } catch (error) {
    toast.add({ severity: 'error', detail: error, life: 3000 });
  }
}

async function onCorePluginFormSubmit(configData: Record<string, any>): Promise<void> {
  if (!selectedCorePlugin.value) return;
  await coreExtensionStorage.setConfig(configData);
}

async function onAccessoryPluginAction(state: { key: string }): Promise<void> {
  if (!selectedAccessoryPluginForConfig.value) return;
  await accessoryExtensionStorage.setValue(state.key, undefined);
}

async function onAccessoryPluginSubmit(state: { key: string; payload: any }): Promise<void> {
  if (!selectedAccessoryPluginForConfig.value) return;
  try {
    const response = await accessoryExtensionStorage.submitValue(state.key, state.payload);
    if (response?.toast) {
      const type = pluginMessageResponseTypeToToastType(response.toast.type);
      toast.add({ severity: type, detail: response.toast.message, life: 3000 });
    }
    if (response?.schema && response.schema.length) {
      dialog.openComponentDialog<PluginSchemaProps>(PluginSchemaDialog, {
        data: {
          title: t('components.dialog.title.config'),
          hideConfirmButton: true,
          contentProps: {
            schemaConfig: { schema: response.schema, config: state.payload },
            pluginName: selectedAccessoryPluginForConfig.value,
            cameraName: camera.value.name,
            buttonKey: state.key,
          },
        },
      });
    }
  } catch (error) {
    toast.add({ severity: 'error', detail: error, life: 3000 });
  }
}

async function onAccessoryPluginFormSubmit(configData: Record<string, any>): Promise<void> {
  if (!selectedAccessoryPluginForConfig.value) return;
  await accessoryExtensionStorage.setConfig(configData);
}

function openRenameSensorDialog(sensor: ReactiveSensor | undefined) {
  if (!sensor) return;

  dialog.openComponentDialog<{ currentDisplayName: string }>(RenameSensorDialog, {
    data: {
      title: t('components.camera_options.sensor_display_name'),
      confirmText: t('components.form.button.save'),
      contentProps: {
        currentDisplayName: sensor.displayName.value,
      },
    },
    onConfirm: async (newName: string | null) => {
      if (newName && newName !== sensor.displayName.value) {
        await sensor.setDisplayName(newName);
      }
    },
  });
}

watch(
  selectedExtension,
  () => {
    nextTick(() => {
      initCategorySelection();
      updateSelectedPlugin();
    });
  },
  { immediate: true },
);

watch(
  [hubExtensions, plugins],
  async ([extensions, pluginsData]) => {
    if (selectedExtension.value === 'hub' && extensions.length && pluginsData?.result && !selectedHubPlugin.value) {
      const firstEnabled = extensions.find((e) => isPluginEnabled(e.pluginName));
      if (firstEnabled) {
        selectedHubPlugin.value = firstEnabled.pluginName;
        selectedPlugin.value = firstEnabled.pluginName;
        await extensionStorage.getConfig();
      }
    }
  },
  { immediate: true },
);

watch(
  [cameraTabPlugins, () => selectedExtension.value],
  async ([plugins, extension]) => {
    if (extension === 'cameraController' && plugins.length && !selectedPlugin.value) {
      selectedPlugin.value = plugins[0].pluginName;
      await extensionStorage.getConfig();
    }
  },
  { immediate: true },
);

watch(
  () => selectedPlugin.value,
  async (newValue, oldValue) => {
    if (selectedExtension.value === 'cameraController' && newValue && newValue !== oldValue) {
      await extensionStorage.getConfig();
    }
  },
);

watch(selectedHubPlugin, async (newValue, oldValue) => {
  if (newValue && newValue !== oldValue && isPluginEnabled(newValue)) {
    selectedPlugin.value = newValue;
    await extensionStorage.getConfig();
  }
});

watch(selectedDetectionType, () => {
  // Reset sensor selection when type changes
  selectedDetectionSensorId.value = undefined;

  // Update selected plugin based on current assignment
  if (selectedDetectionType.value) {
    const assignment = getDetectionAssignment(selectedDetectionType.value);
    if (assignment && isPluginEnabled(assignment.name)) {
      selectedDetectionPlugin.value = assignment.name;
    } else {
      selectedDetectionPlugin.value = undefined;
    }
  } else {
    selectedDetectionPlugin.value = undefined;
  }
  updateSelectedPlugin();

  // Auto-select first sensor
  nextTick(() => {
    if (detectionSensorsForType.value.length) {
      selectedDetectionSensorId.value = detectionSensorsForType.value[0].id;
    }
  });
});

watch(selectedDetectionPlugin, async (newValue, oldValue) => {
  if (newValue !== oldValue && selectedDetectionType.value) {
    const currentAssignment = getDetectionAssignment(selectedDetectionType.value);

    if (!newValue && oldValue) {
      // Deselected - disable the extension
      await disableExtension({ cameraname: camera.value.name, pluginname: oldValue, type: selectedDetectionType.value });
      schemaRef.value?.reset();
      selectedDetectionSensorId.value = undefined;
    } else if (newValue) {
      // Selected - enable the extension (this will also disable the previous one if any)
      if (currentAssignment?.name !== newValue) {
        await enableExtension({ cameraname: camera.value.name, pluginname: newValue, type: selectedDetectionType.value });
      }
      // Fetch plugin config for Plugin Settings
      await detectionExtensionStorage.getConfig();
    }

    nextTick(() => updateSelectedPlugin(newValue));

    // Auto-select first sensor after plugin selection
    nextTick(() => {
      if (detectionSensorsForType.value.length) {
        selectedDetectionSensorId.value = detectionSensorsForType.value[0].id;
      }
    });
  }
});

watch(selectedCoreType, () => {
  // Reset sensor selection when type changes
  selectedCoreSensorId.value = undefined;

  // Update selected plugin based on current assignment
  if (selectedCoreType.value) {
    const assignment = getCoreAssignment(selectedCoreType.value);
    if (assignment && isPluginEnabled(assignment.name)) {
      selectedCorePlugin.value = assignment.name;
    } else {
      selectedCorePlugin.value = undefined;
    }
  } else {
    selectedCorePlugin.value = undefined;
  }
  updateSelectedPlugin();

  // Auto-select first sensor
  nextTick(() => {
    if (coreSensorsForType.value.length) {
      selectedCoreSensorId.value = coreSensorsForType.value[0].id;
    }
  });
});

watch(selectedCorePlugin, async (newValue, oldValue) => {
  if (newValue !== oldValue && selectedCoreType.value) {
    const currentAssignment = getCoreAssignment(selectedCoreType.value);

    if (!newValue && oldValue) {
      await disableExtension({ cameraname: camera.value.name, pluginname: oldValue, type: selectedCoreType.value });
      schemaRef.value?.reset();
      selectedCoreSensorId.value = undefined;
    } else if (newValue) {
      if (currentAssignment?.name !== newValue) {
        await enableExtension({ cameraname: camera.value.name, pluginname: newValue, type: selectedCoreType.value });
      }
      // Fetch plugin config for Plugin Settings
      await coreExtensionStorage.getConfig();
    }

    nextTick(() => updateSelectedPlugin(newValue));

    // Auto-select first sensor after plugin selection
    nextTick(() => {
      if (coreSensorsForType.value.length) {
        selectedCoreSensorId.value = coreSensorsForType.value[0].id;
      }
    });
  }
});

watch([selectedDetectionSensorId, selectedDetectionSensorPluginId], async ([sensorId, pluginId]) => {
  if (sensorId && pluginId) {
    await detectionSensorStorage.getConfig();
  }
});

watch([selectedCoreSensorId, selectedCoreSensorPluginId], async ([sensorId, pluginId]) => {
  if (sensorId && pluginId) {
    await coreSensorStorage.getConfig();
  }
});

watch(selectedAccessoryType, () => {
  // Reset sensor selection when type changes
  selectedAccessorySensorId.value = undefined;

  // Set plugin for config (first assigned plugin for this type)
  if (assignedAccessoryPlugins.value.length) {
    selectedAccessoryPluginForConfig.value = assignedAccessoryPlugins.value[0];
  } else {
    selectedAccessoryPluginForConfig.value = undefined;
  }

  // Auto-select first sensor of the new type
  if (accessorySensorsForType.value.length) {
    selectedAccessorySensorId.value = accessorySensorsForType.value[0].id;
  }
});

watch(selectedAccessoryPluginForConfig, async (newValue) => {
  if (newValue) {
    await accessoryExtensionStorage.getConfig();
  }
});

watch(selectedAccessorySensorId, async (newValue) => {
  if (newValue && selectedAccessoryPluginId.value) {
    await sensorStorage.getConfig();
  }
});

watch(
  cameraTabPlugins,
  (plugins) => {
    const hasCameraTab = extensionTypes.value.indexOf('cameraController') !== -1;

    if (plugins.length && !hasCameraTab) {
      // Add Camera tab at the beginning
      extensionTypes.value.unshift('cameraController');
      // If no extension is selected yet, select Camera tab
      if (!selectedExtension.value || selectedExtension.value === 'hub') {
        selectedExtension.value = 'cameraController';
        if (plugins.length && !selectedPlugin.value) {
          selectedPlugin.value = plugins[0].pluginName;
        }
      }
    } else if (!plugins.length && hasCameraTab) {
      // Remove Camera tab if no plugins
      extensionTypes.value = extensionTypes.value.filter((t) => t !== 'cameraController');
      // Switch to hub if currently on Camera tab
      if (selectedExtension.value === 'cameraController') {
        selectedExtension.value = 'hub';
      }
    }
  },
  { immediate: true },
);

onBeforeMount(async () => {
  await cameraExtensionsSuspense();
  initCategorySelection();
  updateSelectedPlugin();
});
</script>

<style scoped></style>
