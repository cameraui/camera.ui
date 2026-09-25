<template>
  <div class="p-4 flex flex-col gap-2">
    <SectionLabel :label="$t('components.camera_options.categories')" :loading="categoriesLoading" />

    <CuiChipGroup v-model="selectedExtension" mandatory @update:model-value="updateSelectedPlugin()">
      <CuiChip v-for="extension in EXTENSION_TYPES" :key="extension" size="small" :disabled="extension === 'cameraController' && !hasCameraTab" :value="extension">
        {{ $t(`components.camera_options.chip_${extension}`) }}
      </CuiChip>
    </CuiChipGroup>

    <Divider class="m-0 py-3" />

    <div v-if="selectedExtension === 'cameraController'" class="flex flex-col gap-2">
      <template v-if="!cameraTabPlugins.length">
        <SectionLabel :label="$t('components.camera_options.chip_plugins')" :loading="contentLoading" />
        <span v-if="!contentLoading" class="text-sm text-muted text-center min-h-[30px]">{{ $t('components.camera_options.no_plugins_enabled') }}</span>
      </template>

      <template v-else>
        <SectionLabel :label="$t('components.camera_options.chip_plugins')" :loading="extensionConfigLoading" />

        <CuiChipGroup v-model="selectedPlugin" :disabled="isExtensionsLoading" mandatory class="min-h-[30px]">
          <CuiChip
            v-for="extension in cameraTabPlugins"
            :key="extension.pluginName"
            size="small"
            :disabled="!isPluginEnabled(extension.pluginName) || loading"
            :value="extension.pluginName"
          >
            {{ extension.displayName }}
          </CuiChip>
        </CuiChipGroup>

        <template v-if="pluginSettings">
          <Divider class="m-0 py-3" />

          <SectionLabel :label="$t('components.camera_options.plugin_settings')" />

          <CuiSchema
            ref="schemaRef"
            :key="selectedPlugin"
            :schema-form="{ schema: pluginSettings.schema, config: pluginSettings.config }"
            :loading="configPatchLoading"
            @on-form-submit="(configData: PluginConfig) => onFormSubmit(selectedPlugin, configData)"
            @on-submit="(state) => onSubmit(state, selectedPlugin)"
            @on-action="(state) => onAction(state, selectedPlugin)"
          />
        </template>
      </template>
    </div>

    <div v-else-if="selectedExtension === 'hub'" class="flex flex-col gap-2">
      <template v-if="!hubExtensions.length">
        <SectionLabel :label="$t('components.camera_options.chip_plugins')" :loading="contentLoading" />
        <span v-if="!contentLoading" class="text-sm text-muted text-center min-h-[30px]">{{ $t('components.camera_options.no_plugins_enabled') }}</span>
      </template>

      <template v-else>
        <SectionLabel :label="$t('components.camera_options.chip_plugins')" :loading="extensionConfigLoading" />

        <CuiChipGroup v-model="selectedHubPlugin" :disabled="isExtensionsLoading" mandatory class="min-h-[30px]">
          <CuiChip
            v-for="extension in hubExtensions"
            :key="extension.pluginName"
            size="small"
            :disabled="!isPluginEnabled(extension.pluginName) || loading"
            :value="extension.pluginName"
          >
            {{ extension.displayName }}
          </CuiChip>
        </CuiChipGroup>

        <template v-if="pluginSettings">
          <Divider class="m-0 py-3" />

          <SectionLabel :label="$t('components.camera_options.plugin_settings')" />

          <CuiSchema
            ref="schemaRef"
            :key="selectedPlugin"
            :schema-form="{ schema: pluginSettings.schema, config: pluginSettings.config }"
            :loading="configPatchLoading"
            @on-form-submit="(configData: PluginConfig) => onFormSubmit(selectedPlugin, configData)"
            @on-submit="(state) => onSubmit(state, selectedPlugin)"
            @on-action="(state) => onAction(state, selectedPlugin)"
          />
        </template>
      </template>
    </div>

    <div v-else-if="selectedExtension === 'detection'" class="flex flex-col gap-2">
      <template v-if="!availableDetectionTypes.length">
        <SectionLabel :label="$t('components.camera_options.sensor_types')" :loading="contentLoading" />
        <span v-if="!contentLoading" class="text-sm text-muted text-center min-h-[30px]">{{ $t('components.camera_options.no_plugins_enabled') }}</span>
      </template>

      <template v-else>
        <SectionLabel :label="$t('components.camera_options.sensor_types')" :loading="contentLoading" />

        <CuiChipGroup v-model="selectedDetectionType" mandatory class="min-h-[30px]">
          <CuiChip v-for="type in availableDetectionTypes" :key="type" size="small" :value="type">
            {{ $t(`components.camera_options.sensor_type_${type}`) }}
          </CuiChip>
        </CuiChipGroup>

        <template v-if="detectionPluginsForType.length">
          <Divider class="m-0 py-3" />

          <SectionLabel :label="$t('components.camera_options.chip_plugins')" :loading="detectionExtensionConfigLoading" />

          <CuiChipGroup v-model="selectedDetectionPlugin" :disabled="isExtensionsLoading" class="min-h-[30px]">
            <CuiChip
              v-for="extension in detectionPluginsForType"
              :key="extension.pluginName"
              size="small"
              filter
              :disabled="!isPluginEnabled(extension.pluginName) || loading"
              :value="extension.pluginName"
            >
              {{ extension.displayName }}
            </CuiChip>
          </CuiChipGroup>

          <template v-if="detectionPluginSettings">
            <Divider class="m-0 py-3" />

            <SectionLabel :label="$t('components.camera_options.plugin_settings')" />

            <CuiSchema
              :key="`detection-plugin-${selectedDetectionPlugin}`"
              :schema-form="{ schema: detectionPluginSettings.schema, config: detectionPluginSettings.config }"
              :loading="configPatchLoading"
              @on-form-submit="(configData: PluginConfig) => onDetectionPluginFormSubmit(configData)"
              @on-submit="(state) => onDetectionPluginSubmit(state)"
              @on-action="(state) => onDetectionPluginAction(state)"
            />
          </template>

          <Divider class="m-0 py-3" />

          <SectionLabel :label="$t('components.camera_options.sensors')" :loading="detectionSensorConfigLoading" />

          <CuiChipGroup v-if="detectionSensorsForType.length" v-model="selectedDetectionSensorId" mandatory class="min-h-[30px]">
            <CuiChip v-for="sensor in detectionSensorsForType" :key="sensor.id" size="small" :value="sensor.id">
              {{ sensor.displayName.value }}
            </CuiChip>
          </CuiChipGroup>

          <span v-else-if="!contentLoading" class="text-sm text-muted text-center min-h-[30px]">{{ $t('components.camera_options.no_sensors') }}</span>

          <template v-if="detectionSensorSettings">
            <Divider class="m-0 py-3" />

            <SectionLabel :label="$t('components.camera_options.sensor_settings')" />

            <CuiSchema
              :key="`sensor-${selectedDetectionSensorId}`"
              :schema-form="{ schema: detectionSensorSettings.schema, config: detectionSensorSettings.config }"
              :loading="configPatchLoading"
              @on-form-submit="(configData: PluginConfig) => onDetectionFormSubmit(configData)"
              @on-submit="(state) => onDetectionSubmit(state)"
              @on-action="(state) => onDetectionAction(state)"
            />
          </template>
        </template>

        <template v-if="showObjectAssist">
          <Divider class="m-0 py-3" />

          <SectionLabel :label="$t('components.camera_options.object_assist')" :loading="objectAssistSensorConfigLoading" />

          <CuiChipGroup v-model="selectedObjectAssistPlugin" :disabled="isExtensionsLoading" class="min-h-[30px]">
            <CuiChip
              v-for="extension in objectAssistPlugins"
              :key="extension.pluginName"
              size="small"
              filter
              :disabled="!isPluginEnabled(extension.pluginName) || loading"
              :value="extension.pluginName"
            >
              {{ extension.displayName }}
            </CuiChip>
          </CuiChipGroup>

          <template v-if="objectAssistSettings">
            <Divider class="m-0 py-3" />

            <SectionLabel :label="$t('components.camera_options.sensor_settings')" />

            <CuiSchema
              :key="`object-assist-${objectAssistSensorId}`"
              :schema-form="{ schema: objectAssistSettings.schema, config: objectAssistSettings.config }"
              :loading="configPatchLoading"
              @on-form-submit="(configData: PluginConfig) => onObjectAssistFormSubmit(configData)"
              @on-submit="(state) => onObjectAssistSubmit(state)"
              @on-action="(state) => onObjectAssistAction(state)"
            />
          </template>
        </template>
      </template>
    </div>

    <div v-else-if="selectedExtension === 'core'" class="flex flex-col gap-2">
      <template v-if="!availableCoreTypes.length">
        <SectionLabel :label="$t('components.camera_options.sensor_types')" :loading="contentLoading" />
        <span v-if="!contentLoading" class="text-sm text-muted text-center min-h-[30px]">{{ $t('components.camera_options.no_plugins_enabled') }}</span>
      </template>

      <template v-else>
        <SectionLabel :label="$t('components.camera_options.sensor_types')" :loading="contentLoading" />

        <CuiChipGroup v-model="selectedCoreType" mandatory class="min-h-[30px]">
          <CuiChip v-for="type in availableCoreTypes" :key="type" size="small" :value="type">
            {{ $t(`components.camera_options.sensor_type_${type}`) }}
          </CuiChip>
        </CuiChipGroup>

        <template v-if="corePluginsForType.length">
          <Divider class="m-0 py-3" />

          <SectionLabel :label="$t('components.camera_options.chip_plugins')" :loading="coreExtensionConfigLoading" />

          <CuiChipGroup v-model="selectedCorePlugin" :disabled="isExtensionsLoading" class="min-h-[30px]">
            <CuiChip
              v-for="extension in corePluginsForType"
              :key="extension.pluginName"
              size="small"
              filter
              :disabled="!isPluginEnabled(extension.pluginName) || loading"
              :value="extension.pluginName"
            >
              {{ extension.displayName }}
            </CuiChip>
          </CuiChipGroup>

          <template v-if="corePluginSettings">
            <Divider class="m-0 py-3" />

            <SectionLabel :label="$t('components.camera_options.plugin_settings')" />

            <CuiSchema
              :key="`core-plugin-${selectedCorePlugin}`"
              :schema-form="{ schema: corePluginSettings.schema, config: corePluginSettings.config }"
              :loading="configPatchLoading"
              @on-form-submit="(configData: PluginConfig) => onCorePluginFormSubmit(configData)"
              @on-submit="(state) => onCorePluginSubmit(state)"
              @on-action="(state) => onCorePluginAction(state)"
            />
          </template>

          <Divider class="m-0 py-3" />

          <SectionLabel :label="$t('components.camera_options.sensors')" :loading="coreSensorConfigLoading" />

          <CuiChipGroup v-if="coreSensorsForType.length" v-model="selectedCoreSensorId" mandatory class="min-h-[30px]">
            <CuiChip v-for="sensor in coreSensorsForType" :key="sensor.id" size="small" :value="sensor.id">
              {{ sensor.displayName.value }}
            </CuiChip>
          </CuiChipGroup>

          <span v-else-if="!contentLoading" class="text-sm text-muted text-center min-h-[30px]">{{ $t('components.camera_options.no_sensors') }}</span>

          <template v-if="coreSensorSettings">
            <Divider class="m-0 py-3" />

            <SectionLabel :label="$t('components.camera_options.sensor_settings')" />

            <CuiSchema
              :key="`sensor-${selectedCoreSensorId}`"
              :schema-form="{ schema: coreSensorSettings.schema, config: coreSensorSettings.config }"
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
        <SectionLabel :label="$t('components.camera_options.sensor_types')" :loading="contentLoading" />
        <span v-if="!contentLoading" class="text-sm text-muted text-center min-h-[30px]">{{ $t('components.camera_options.no_plugins_enabled') }}</span>
      </template>

      <template v-else>
        <SectionLabel :label="$t('components.camera_options.sensor_types')" :loading="contentLoading" />

        <CuiChipGroup v-model="selectedAccessoryType" mandatory class="min-h-[30px]">
          <CuiChip v-for="type in availableAccessoryTypes" :key="type" size="small" :value="type">
            {{ $t(`components.camera_options.sensor_type_${type}`) }}
          </CuiChip>
        </CuiChipGroup>

        <template v-if="accessoryPluginsForType.length">
          <Divider class="m-0 py-3" />

          <SectionLabel :label="$t('components.camera_options.chip_plugins')" :loading="accessoryExtensionConfigLoading" />

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
              :disabled="!isPluginEnabled(extension.pluginName) || loading"
              :value="extension.pluginName"
            >
              {{ extension.displayName }}
            </CuiChip>
          </CuiChipGroup>

          <template v-if="accessoryPluginSettings">
            <Divider class="m-0 py-3" />

            <SectionLabel :label="$t('components.camera_options.plugin_settings')" />

            <CuiSchema
              :key="`accessory-plugin-${selectedAccessoryPluginForConfig}`"
              :schema-form="{ schema: accessoryPluginSettings.schema, config: accessoryPluginSettings.config }"
              :loading="configPatchLoading"
              @on-form-submit="(configData: PluginConfig) => onAccessoryPluginFormSubmit(configData)"
              @on-submit="(state) => onAccessoryPluginSubmit(state)"
              @on-action="(state) => onAccessoryPluginAction(state)"
            />
          </template>
        </template>

        <Divider class="m-0 py-3" />

        <SectionLabel :label="$t('components.camera_options.sensors')" :loading="sensorConfigLoading" />

        <CuiChipGroup v-if="accessorySensorsForType.length" v-model="selectedAccessorySensorId" mandatory class="min-h-[30px]">
          <CuiChip v-for="sensor in accessorySensorsForType" :key="sensor.id" size="small" :value="sensor.id">
            {{ sensor.displayName.value }}
          </CuiChip>
        </CuiChipGroup>

        <span v-else-if="!contentLoading" class="text-sm text-muted text-center min-h-[30px]">{{ $t('components.camera_options.no_sensors') }}</span>

        <template v-if="accessorySensorSettings">
          <Divider class="m-0 py-3" />

          <SectionLabel :label="$t('components.camera_options.sensor_settings')" />

          <CuiSchema
            :key="`sensor-${selectedAccessorySensorId}`"
            :schema-form="{ schema: accessorySensorSettings.schema, config: accessorySensorSettings.config }"
            :loading="configPatchLoading"
            @on-form-submit="(configData: PluginConfig) => onAccessoryFormSubmit(configData)"
            @on-submit="(state) => onAccessorySubmit(state)"
            @on-action="(state) => onAccessoryAction(state)"
          />
        </template>
      </template>
    </div>

    <div v-else-if="selectedExtension === 'more'" class="flex flex-col gap-2">
      <SectionLabel :label="$t('components.camera_options.manage_plugins')" :loading="extensionsListLoading" />

      <span v-if="!filteredExtensions.length && !extensionsListLoading" class="text-sm text-muted text-center min-h-[30px]">{{
        $t('components.camera_options.no_plugins_found')
      }}</span>

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
  </div>
</template>

<script setup lang="ts">
import { useCameraStorage, useSensors, useSensorStorage } from '@camera.ui/browser';
import { canCreateCameras, canProvideSensorsToAnyCameras, isHub, SensorType } from '@camera.ui/sdk';
import { getAccessorySensorTypes, getAssignmentKey, getCoreSensorTypes, getDetectionSensorTypes, isSingleProviderType, VIRTUAL_SENSOR_OWNER_ID } from '@shared/types';

import { CamerasQuery } from '@/api/routes/cameras.js';
import { PluginsQuery } from '@/api/routes/plugins.js';
import { SensorsQuery } from '@/api/routes/sensors.js';
import { pluginMessageResponseTypeToToastType } from '@/common/utils.js';
import PluginSchemaDialog from '@/components/CuiDialog/templates/PluginSchema/PluginSchema.vue';
import CuiSchema from '@/components/CuiSchema/CuiSchema.vue';

import type { PluginSchemaProps } from '@/components/CuiDialog/templates/PluginSchema/types.js';
import type { ReactiveSensor } from '@camera.ui/browser';
import type { AssignedPlugin, PluginConfig, SchemaConfig } from '@camera.ui/sdk';
import type { PluginExtension } from '@shared/types';
import type { CameraOptionsTabEmits, CameraOptionsTabProps } from '../../types.js';

type ExtensionTypes = 'hub' | 'detection' | 'core' | 'accessories' | 'cameraController' | 'more';

const EXTENSION_TYPES: ExtensionTypes[] = ['cameraController', 'hub', 'detection', 'core', 'accessories', 'more'];

const DETECTION_SENSOR_TYPES = getDetectionSensorTypes().filter((type: SensorType) => type !== SensorType.ObjectAssist);
const CORE_SENSOR_TYPES = getCoreSensorTypes();
const ACCESSORIES_SENSOR_TYPES = getAccessorySensorTypes();

const camerasQuery = new CamerasQuery();
const pluginsQuery = new PluginsQuery();
const sensorsQuery = new SensorsQuery();

const props = defineProps<CameraOptionsTabProps>();

defineEmits<CameraOptionsTabEmits>();

const toast = useCuiToast();
const dialog = useCuiDialog();
const { t } = useI18n();
const { camera, cameraDevice, loading } = toRefs(props);

const { data: plugins, isBusy: pluginsLoading } = pluginsQuery.getPluginsQuery({ page: 1, pageSize: -1 });
const { data: cameraExtensions, isBusy: cameraExtensionsLoading, suspense: cameraExtensionsSuspense } = camerasQuery.getCameraExtensionsQuery(camera.value.name);
const { data: cameraSensors, isBusy: cameraSensorsLoading } = sensorsQuery.getCameraSensorsQuery(camera.value._id);
const { data: extensionsList, isBusy: extensionsListLoading } = pluginsQuery.getPluginsExtensionsQuery({ page: 1, pageSize: -1 });
const { mutateAsync: enableExtension, isPending: enableExtensionPending } = camerasQuery.enableCameraExtensionQuery();
const { mutateAsync: disableExtension, isPending: disableExtensionPending } = camerasQuery.disableCameraExtensionQuery();
const { mutateAsync: activateExtension, isPending: activateExtensionPending } = camerasQuery.activateCameraExtensionQuery();
const { mutateAsync: deactivateExtension, isPending: deactivateExtensionPending } = camerasQuery.deactivateCameraExtensionQuery();

const { sensors: allSensors, isLoading: sensorsLoading } = useSensors(cameraDevice);

const schemaRef = useTemplateRef<InstanceType<typeof CuiSchema>>('schemaRef');
const selectedExtension = ref<ExtensionTypes>();
const selectedPlugin = ref('');
const selectedHubPlugin = ref<string>();
const selectedDetectionType = ref<SensorType>();
const selectedDetectionPlugin = ref<string>();
const selectedObjectAssistPlugin = ref<string>();
const selectedCoreType = ref<SensorType>();
const selectedCorePlugin = ref<string>();
const selectedAccessoryType = ref<SensorType>();
const selectedAccessorySensorId = ref<string>();
const selectedDetectionSensorId = ref<string>();
const selectedCoreSensorId = ref<string>();
const selectedAccessoryPluginForConfig = ref<string>();
const detectionPluginConfigSnapshot = shallowRef<{ plugin: string; config: SchemaConfig } | undefined>();
const detectionSensorConfigFor = ref<string>();

const selectedAccessoryPluginName = computed(() => {
  if (!selectedAccessorySensorId.value) return '';
  const sensor = accessorySensorsForType.value.find((s) => s.id === selectedAccessorySensorId.value);
  if (!sensor?.pluginId) return '';
  return getPluginNameFromId(sensor.pluginId) || '';
});

const selectedAccessoryPluginId = computed(() => {
  if (!selectedAccessorySensorId.value) return '';
  const sensor = accessorySensorsForType.value.find((s) => s.id === selectedAccessorySensorId.value);
  if (!sensor || sensor.pluginId === VIRTUAL_SENSOR_OWNER_ID) return '';
  return sensor.pluginId;
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
  for (const sensor of allSensors.value) {
    if (ACCESSORIES_SENSOR_TYPES.includes(sensor.type)) {
      types.add(sensor.type);
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
    pluginNames = assignments.map((a) => a.name);
  } else if (assignments && typeof assignments === 'object' && 'name' in assignments) {
    pluginNames = [assignments.name];
  }

  const pluginOrder = accessoryPluginsForType.value.map((p) => p.pluginName);
  return pluginNames.sort((a, b) => pluginOrder.indexOf(a) - pluginOrder.indexOf(b));
});

const assignedAccessoryPluginIds = computed<string[]>(() => {
  if (!selectedAccessoryType.value) return [];
  const key = getAssignmentKey(selectedAccessoryType.value) as keyof typeof camera.value.assignments;
  const assignments = camera.value.assignments[key];

  if (Array.isArray(assignments)) return assignments.map((a) => a.id);
  if (assignments && typeof assignments === 'object' && 'id' in assignments) return [assignments.id];
  return [];
});

const accessorySensorsForType = computed<ReactiveSensor[]>(() => {
  const assigned = new Set(assignedAccessoryPluginIds.value);
  return allSensors.value
    .filter((s) => s.type === selectedAccessoryType.value && (assigned.has(s.pluginId) || s.pluginId === VIRTUAL_SENSOR_OWNER_ID))
    .sort((a, b) => a.displayName.value.localeCompare(b.displayName.value));
});

const extensionStorage = useCameraStorage(cameraDevice, selectedPlugin);
const extensionConfig = extensionStorage.config;
const extensionConfigLoading = extensionStorage.isLoading;

const sensorStorage = useSensorStorage(selectedAccessorySensorId, selectedAccessoryPluginId);
const sensorConfig = sensorStorage.config;
const sensorConfigLoading = sensorStorage.isLoading;

const pluginSettings = computed(() => (selectedPlugin.value && extensionConfig.value?.schema?.length ? extensionConfig.value : undefined));

const accessorySensorSettings = computed(() =>
  selectedAccessorySensorId.value && selectedAccessoryPluginName.value && sensorConfig.value?.schema?.length ? sensorConfig.value : undefined,
);

const categoriesLoading = computed(() => pluginsLoading.value || extensionsListLoading.value || cameraExtensionsLoading.value || cameraSensorsLoading.value);

const contentLoading = computed(() => categoriesLoading.value || isExtensionsLoading.value || sensorsLoading.value);

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

const hasCameraTab = computed(() => cameraTabPlugins.value.length > 0);

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
  const pluginName = selectedDetectionPlugin.value;
  if (!pluginName) return [];
  return allSensors.value
    .filter((s) => s.type === selectedDetectionType.value && getPluginNameFromId(s.pluginId) === pluginName)
    .sort((a, b) => a.displayName.value.localeCompare(b.displayName.value));
});

const selectedDetectionSensorPluginName = computed(() => {
  if (!selectedDetectionSensorId.value) return '';
  const sensor = detectionSensorsForType.value.find((s) => s.id === selectedDetectionSensorId.value);
  if (!sensor?.pluginId) return '';
  return getPluginNameFromId(sensor.pluginId) || '';
});

const objectAssistAssignmentName = computed(() => {
  const assignment = getDetectionAssignment(SensorType.ObjectAssist);
  return assignment && isPluginEnabled(assignment.name) ? assignment.name : undefined;
});

const objectSensorIsExternal = computed(() => {
  const assignment = getDetectionAssignment(SensorType.Object);
  if (!assignment) return false;
  const sensor = (cameraSensors.value ?? []).find((s) => s.connected && s.type === SensorType.Object && getPluginNameFromId(s.pluginId) === assignment.name);
  return sensor?.requiresFrames === false;
});

const objectAssistPlugins = computed<PluginExtension[]>(() => {
  const objectPluginName = getDetectionAssignment(SensorType.Object)?.name;
  const frameBased = new Set(
    (cameraSensors.value ?? [])
      .filter((s) => s.type === SensorType.Object && s.requiresFrames)
      .map((s) => getPluginNameFromId(s.pluginId))
      .filter((name) => name !== undefined),
  );
  const ex = cameraExtensions.value?.filter((p) => p.pluginName !== objectPluginName && frameBased.has(p.pluginName)) || [];
  return sortExtensions(ex);
});

const showObjectAssist = computed(() => {
  return selectedDetectionType.value === SensorType.Object && objectSensorIsExternal.value && objectAssistPlugins.value.length > 0;
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
  const pluginName = selectedCorePlugin.value;
  if (!pluginName) return [];
  return allSensors.value
    .filter((s) => s.type === selectedCoreType.value && getPluginNameFromId(s.pluginId) === pluginName)
    .sort((a, b) => a.displayName.value.localeCompare(b.displayName.value));
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
const detectionExtensionConfigLoading = detectionExtensionStorage.isLoading;

const detectionSensorStorage = useSensorStorage(selectedDetectionSensorId, selectedDetectionSensorPluginId);
const detectionSensorConfig = detectionSensorStorage.config;
const detectionSensorConfigLoading = detectionSensorStorage.isLoading;

const detectionPluginSettings = computed(() => {
  if (!selectedDetectionPlugin.value || selectedDetectionPlugin.value === camera.value.pluginInfo?.name) return undefined;
  const snapshot = detectionPluginConfigSnapshot.value;
  if (snapshot?.plugin !== selectedDetectionPlugin.value) return undefined;
  return snapshot.config.schema?.length ? snapshot.config : undefined;
});

const detectionSensorSettings = computed(() =>
  selectedDetectionSensorId.value &&
  selectedDetectionSensorPluginName.value &&
  detectionSensorConfigFor.value === selectedDetectionSensorId.value &&
  detectionSensorConfig.value?.schema?.length
    ? detectionSensorConfig.value
    : undefined,
);

const objectAssistSensor = computed<ReactiveSensor | undefined>(() => {
  const pluginName = selectedObjectAssistPlugin.value;
  if (!pluginName || pluginName === getDetectionAssignment(SensorType.Object)?.name) return undefined;
  return allSensors.value.find((s) => s.type === SensorType.Object && getPluginNameFromId(s.pluginId || '') === pluginName);
});

const objectAssistSensorId = computed(() => objectAssistSensor.value?.id ?? '');
const objectAssistSensorPluginId = computed(() => objectAssistSensor.value?.pluginId ?? '');

const objectAssistSensorStorage = useSensorStorage(objectAssistSensorId, objectAssistSensorPluginId);
const objectAssistSensorConfig = objectAssistSensorStorage.config;
const objectAssistSensorConfigLoading = objectAssistSensorStorage.isLoading;

const objectAssistSettings = computed(() => (objectAssistSensorId.value && objectAssistSensorConfig.value?.schema?.length ? objectAssistSensorConfig.value : undefined));

const selectedCorePluginName = computed(() => selectedCorePlugin.value ?? '');
const coreExtensionStorage = useCameraStorage(cameraDevice, selectedCorePluginName);
const coreExtensionConfig = coreExtensionStorage.config;
const coreExtensionConfigLoading = coreExtensionStorage.isLoading;

const coreSensorStorage = useSensorStorage(selectedCoreSensorId, selectedCoreSensorPluginId);
const coreSensorConfig = coreSensorStorage.config;
const coreSensorConfigLoading = coreSensorStorage.isLoading;

const corePluginSettings = computed(() => {
  if (!selectedCorePlugin.value || selectedCorePlugin.value === camera.value.pluginInfo?.name) return undefined;
  return coreExtensionConfig.value?.schema?.length ? coreExtensionConfig.value : undefined;
});

const coreSensorSettings = computed(() =>
  selectedCoreSensorId.value && selectedCoreSensorPluginName.value && coreSensorConfig.value?.schema?.length ? coreSensorConfig.value : undefined,
);

const selectedAccessoryPluginForConfigName = computed(() => selectedAccessoryPluginForConfig.value ?? '');
const accessoryExtensionStorage = useCameraStorage(cameraDevice, selectedAccessoryPluginForConfigName);
const accessoryExtensionConfig = accessoryExtensionStorage.config;
const accessoryExtensionConfigLoading = accessoryExtensionStorage.isLoading;

const accessoryPluginSettings = computed(() => {
  if (!selectedAccessoryPluginForConfig.value || selectedAccessoryPluginForConfig.value === camera.value.pluginInfo?.name) return undefined;
  return accessoryExtensionConfig.value?.schema?.length ? accessoryExtensionConfig.value : undefined;
});

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
  return (cameraSensors.value ?? []).some((s) => s.type === type && getPluginNameFromId(s.pluginId) === p.pluginName);
}

function typeHasContent(type: SensorType): boolean {
  if (allSensors.value.some((s) => s.type === type)) return true;
  if ((cameraSensors.value ?? []).some((s) => s.type === type)) return true;
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
        selectedPlugin.value = isPluginEnabled(selectedHubPlugin.value) || isPluginEnabled(hubExtensions.value[0]?.pluginName) || '';
        selectedHubPlugin.value = selectedPlugin.value || undefined;
        break;
      case 'detection': {
        const assignment = selectedDetectionType.value ? getDetectionAssignment(selectedDetectionType.value) : undefined;
        const assignedPluginName = isPluginEnabled(assignment);
        selectedPlugin.value = assignedPluginName || '';
        selectedDetectionPlugin.value = assignedPluginName || undefined;
        break;
      }
      case 'core': {
        const assignment = selectedCoreType.value ? getCoreAssignment(selectedCoreType.value) : undefined;
        const assignedPluginName = isPluginEnabled(assignment);
        selectedPlugin.value = assignedPluginName || '';
        selectedCorePlugin.value = assignedPluginName || undefined;
        break;
      }
      case 'accessories':
        selectedPlugin.value = '';
        break;
      default:
        selectedPlugin.value = '';
        break;
    }
  }

  const ownStorage = selectedExtension.value === 'accessories' || selectedExtension.value === 'detection' || selectedExtension.value === 'core';
  if (selectedPlugin.value && !ownStorage && isPluginEnabled(selectedPlugin.value)) {
    await extensionStorage.getConfig();
  }
}

function initCategorySelection(): void {
  switch (selectedExtension.value) {
    case 'cameraController':
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
      if (availableDetectionTypes.value.length && (!selectedDetectionType.value || !availableDetectionTypes.value.includes(selectedDetectionType.value))) {
        selectedDetectionType.value = availableDetectionTypes.value[0];
      }
      const assignment = selectedDetectionType.value ? getDetectionAssignment(selectedDetectionType.value) : undefined;
      if (assignment && isPluginEnabled(assignment.name)) {
        selectedDetectionPlugin.value = assignment.name;
      } else {
        selectedDetectionPlugin.value = undefined;
      }
      break;
    }
    case 'core': {
      if (availableCoreTypes.value.length && (!selectedCoreType.value || !availableCoreTypes.value.includes(selectedCoreType.value))) {
        selectedCoreType.value = availableCoreTypes.value[0];
      }
      const controlAssignment = selectedCoreType.value ? getCoreAssignment(selectedCoreType.value) : undefined;
      if (controlAssignment && isPluginEnabled(controlAssignment.name)) {
        selectedCorePlugin.value = controlAssignment.name;
      } else {
        selectedCorePlugin.value = undefined;
      }
      break;
    }
    case 'accessories':
      if (availableAccessoryTypes.value.length && (!selectedAccessoryType.value || !availableAccessoryTypes.value.includes(selectedAccessoryType.value))) {
        selectedAccessoryType.value = availableAccessoryTypes.value[0];
      }
      nextTick(() => {
        if (assignedAccessoryPlugins.value.length && !selectedAccessoryPluginForConfig.value) {
          selectedAccessoryPluginForConfig.value = assignedAccessoryPlugins.value[0];
        }
      });
      break;
  }
}

async function toggleExtension(extension: PluginExtension): Promise<void> {
  if (cameraExtensions.value) {
    const isActive = cameraExtensions.value.some((p) => p.pluginName === extension.pluginName);

    if (isActive) {
      await deactivateExtension({ cameraname: camera.value.name, pluginname: extension.pluginName });
      schemaRef.value?.reset();
    } else {
      await activateExtension({ cameraname: camera.value.name, pluginname: extension.pluginName });
    }
  }
}

async function onAccessoryPluginsChange(value: string | number | object | undefined): Promise<void> {
  if (!selectedAccessoryType.value) return;

  const oldSelection = assignedAccessoryPlugins.value;

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
    }

    if (newPlugin) {
      await enableExtension({
        cameraname: camera.value.name,
        pluginname: newPlugin,
        type: selectedAccessoryType.value,
      });
      selectedAccessoryPluginForConfig.value = newPlugin;
    } else {
      selectedAccessoryPluginForConfig.value = undefined;
    }
    return;
  }

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

    if (selectedAccessoryPluginForConfig.value === pluginName) {
      selectedAccessoryPluginForConfig.value = undefined;
    }
  }

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
            cameraId: camera.value._id,
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

async function onObjectAssistAction(state: { key: string }): Promise<void> {
  if (!objectAssistSensorId.value) return;
  try {
    await objectAssistSensorStorage.setValue(state.key, undefined);
    toast.add({ severity: 'success', detail: t('components.toast.config_updated'), life: 3000 });
  } catch (error) {
    toast.add({ severity: 'error', detail: error, life: 3000 });
  }
}

async function onObjectAssistSubmit(state: { key: string; payload: any }): Promise<void> {
  if (!objectAssistSensorId.value) return;
  try {
    const response = await objectAssistSensorStorage.submitValue(state.key, state.payload);
    if (response?.toast) {
      const type = pluginMessageResponseTypeToToastType(response.toast.type);
      toast.add({ severity: type, detail: response.toast.message, life: 3000 });
    }
  } catch (error) {
    toast.add({ severity: 'error', detail: error, life: 3000 });
  }
}

async function onObjectAssistFormSubmit(configData: Record<string, any>): Promise<void> {
  if (!objectAssistSensorId.value) return;
  try {
    await objectAssistSensorStorage.setConfig(configData);
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
            cameraId: camera.value._id,
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
            cameraId: camera.value._id,
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
  const plugin = selectedDetectionPlugin.value;
  if (!plugin) return;
  await detectionExtensionStorage.setConfig(configData);
  const config = await detectionExtensionStorage.getConfig();
  if (config && selectedDetectionPlugin.value === plugin) detectionPluginConfigSnapshot.value = { plugin, config };
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
            cameraId: camera.value._id,
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
            cameraId: camera.value._id,
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

watch(
  selectedDetectionType,
  () => {
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
  },
  { flush: 'sync' },
);

watch(selectedDetectionPlugin, async (newValue, oldValue) => {
  if (newValue !== oldValue && selectedDetectionType.value) {
    const currentAssignment = getDetectionAssignment(selectedDetectionType.value);

    detectionPluginConfigSnapshot.value = undefined;

    if (!newValue && oldValue) {
      await disableExtension({ cameraname: camera.value.name, pluginname: oldValue, type: selectedDetectionType.value });
      schemaRef.value?.reset();
    } else if (newValue) {
      if (currentAssignment?.name !== newValue) {
        await enableExtension({ cameraname: camera.value.name, pluginname: newValue, type: selectedDetectionType.value });
      }
      const config = await detectionExtensionStorage.getConfig();
      if (config && selectedDetectionPlugin.value === newValue) detectionPluginConfigSnapshot.value = { plugin: newValue, config };
    }

    nextTick(() => updateSelectedPlugin(newValue));
  }
});

watch(
  detectionSensorsForType,
  (sensors) => {
    if (selectedDetectionSensorId.value && sensors.some((s) => s.id === selectedDetectionSensorId.value)) return;
    selectedDetectionSensorId.value = sensors[0]?.id;
  },
  { immediate: true, flush: 'sync' },
);

watch(objectAssistAssignmentName, (name) => (selectedObjectAssistPlugin.value = name), { immediate: true });

watch(selectedObjectAssistPlugin, async (newValue, oldValue) => {
  if (newValue === oldValue || newValue === objectAssistAssignmentName.value) return;

  if (!newValue && oldValue) {
    await disableExtension({ cameraname: camera.value.name, pluginname: oldValue, type: SensorType.ObjectAssist });
  } else if (newValue) {
    await enableExtension({ cameraname: camera.value.name, pluginname: newValue, type: SensorType.ObjectAssist });
  }
});

watch(
  selectedCoreType,
  () => {
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
  },
  { flush: 'sync' },
);

watch(selectedCorePlugin, async (newValue, oldValue) => {
  if (newValue !== oldValue && selectedCoreType.value) {
    const currentAssignment = getCoreAssignment(selectedCoreType.value);

    if (!newValue && oldValue) {
      await disableExtension({ cameraname: camera.value.name, pluginname: oldValue, type: selectedCoreType.value });
      schemaRef.value?.reset();
    } else if (newValue) {
      if (currentAssignment?.name !== newValue) {
        await enableExtension({ cameraname: camera.value.name, pluginname: newValue, type: selectedCoreType.value });
      }
      await coreExtensionStorage.getConfig();
    }

    nextTick(() => updateSelectedPlugin(newValue));
  }
});

watch(
  coreSensorsForType,
  (sensors) => {
    if (selectedCoreSensorId.value && sensors.some((s) => s.id === selectedCoreSensorId.value)) return;
    selectedCoreSensorId.value = sensors[0]?.id;
  },
  { immediate: true, flush: 'sync' },
);

watch([selectedDetectionSensorId, selectedDetectionSensorPluginId], async ([sensorId, pluginId]) => {
  detectionSensorConfigFor.value = undefined;
  if (sensorId && pluginId) {
    await detectionSensorStorage.getConfig();
    if (selectedDetectionSensorId.value === sensorId) detectionSensorConfigFor.value = sensorId;
  }
});

watch([selectedCoreSensorId, selectedCoreSensorPluginId], async ([sensorId, pluginId]) => {
  if (sensorId && pluginId) {
    await coreSensorStorage.getConfig();
  }
});

watch(
  selectedAccessoryType,
  () => {
    if (assignedAccessoryPlugins.value.length) {
      selectedAccessoryPluginForConfig.value = assignedAccessoryPlugins.value[0];
    } else {
      selectedAccessoryPluginForConfig.value = undefined;
    }
  },
  { flush: 'sync' },
);

watch(
  accessorySensorsForType,
  (sensors) => {
    if (selectedAccessorySensorId.value && sensors.some((s) => s.id === selectedAccessorySensorId.value)) return;
    selectedAccessorySensorId.value = sensors[0]?.id;
  },
  { immediate: true, flush: 'sync' },
);

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
  [hasCameraTab, categoriesLoading],
  ([hasCamera, loading]) => {
    if (hasCamera) {
      selectedExtension.value ??= 'cameraController';
    } else if (!loading && (!selectedExtension.value || selectedExtension.value === 'cameraController')) {
      selectedExtension.value = 'hub';
    }
  },
  { immediate: true, flush: 'sync' },
);

onBeforeMount(async () => {
  await cameraExtensionsSuspense();
  initCategorySelection();
  updateSelectedPlugin();
});
</script>

<style scoped></style>
