import { useSensorsByType } from '@camera.ui/browser';
import { SensorType } from '@camera.ui/sdk';

import { CamerasQuery } from '@/api/routes/cameras.js';
import { getAssignmentKey, getSensorProperties, SENSOR_TYPE_CONFIG, VIRTUAL_SENSOR_OWNER_ID } from '@shared/types';

import type { ReactiveSensor } from '@camera.ui/browser';
import type { PluginAssignments } from '@camera.ui/sdk';
import type { DBCamera } from '@shared/types';

export interface SensorTypeOption {
  label: string;
  value: string;
  meta: (typeof SENSOR_TYPE_CONFIG)[SensorType];
  hasVirtual: boolean;
}

export interface SensorInstanceOption {
  label: string;
  sensorName: string;
  pluginId: string;
}

export function useCameraOptions() {
  const camerasQuery = new CamerasQuery();
  const { t } = useI18n();
  const { data: camerasData } = camerasQuery.getCamerasQuery({ page: 1, pageSize: -1 });

  const cameras = computed<DBCamera[]>(() => camerasData.value?.result ?? []);

  const cameraOptions = computed(() =>
    cameras.value.map((c) => ({
      label: c.name,
      value: c._id,
    })),
  );

  function getSensorTypes(cameraId: string): SensorTypeOption[] {
    const camera = cameras.value.find((c) => c._id === cameraId);
    if (!camera?.assignments) return [];

    return Object.values(SensorType)
      .filter((type) => {
        const key = getAssignmentKey(type) as keyof PluginAssignments;
        const assignment = camera.assignments[key];
        if (!assignment) return false;
        if (Array.isArray(assignment)) return assignment.length > 0;
        return true;
      })
      .map((type) => {
        const key = getAssignmentKey(type) as keyof PluginAssignments;
        const assignment = camera.assignments[key];
        return {
          label: type,
          value: type,
          meta: SENSOR_TYPE_CONFIG[type],
          hasVirtual: Array.isArray(assignment) && assignment.some((p) => p.id === VIRTUAL_SENSOR_OWNER_ID),
        };
      });
  }

  function useSensorInstances(cameraId: MaybeRefOrGetter<string | undefined>, sensorType: MaybeRefOrGetter<SensorType>) {
    const { sensors, isLoading } = useSensorsByType(cameraId, sensorType);

    const instanceOptions = computed<SensorInstanceOption[]>(() =>
      sensors.value.map((s: ReactiveSensor) => ({
        label: s.displayName.value || s.name,
        sensorName: s.name,
        pluginId: s.pluginId,
      })),
    );

    return { instanceOptions, isLoading };
  }

  function getPropertiesForSensor(sensorType: string) {
    return getSensorProperties(sensorType as SensorType).map((prop) => ({
      label: t(`components.automation_nodes.sensor_property_${prop}`),
      value: prop,
    }));
  }

  return {
    cameras,
    cameraOptions,
    getSensorTypes,
    useSensorInstances,
    getPropertiesForSensor,
  };
}
