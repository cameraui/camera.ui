import { useAllSensors } from '@camera.ui/browser';
import { SensorType } from '@camera.ui/sdk';

import { CamerasQuery } from '@/api/routes/cameras.js';
import { sensorPropertyLabelKey } from '@/common/sensorDisplay.js';
import { getObservableSensorProperties, getWritableSensorProperties } from '@shared/types';

import type { ReactiveSensor } from '@camera.ui/browser';
import type { DBCamera } from '@shared/types';

export interface SensorOption {
  label: string;
  value: string;
  type: SensorType;
}

export function useCameraNames() {
  const camerasQuery = new CamerasQuery();
  const { data } = camerasQuery.getCamerasQuery({ page: 1, pageSize: -1 });

  function cameraName(id: string): string | undefined {
    return data.value?.result?.find((c) => c._id === id)?.name;
  }

  return { cameraName };
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

  function useSensorOptions(filter?: (sensor: ReactiveSensor) => boolean) {
    const { sensors, isLoading } = useAllSensors({ sensorIds: [] });

    const sensorOptions = computed<SensorOption[]>(() =>
      sensors.value
        .filter((s) => filter?.(s) ?? true)
        .map((s) => {
          const typeLabel = t(`components.camera_options.sensor_type_${s.type}`);
          const cameraNames = s.assignedCameraIds.value
            .map((id) => cameras.value.find((c) => c._id === id)?.name)
            .filter(Boolean)
            .join(', ');
          return {
            label: `${s.displayName.value || s.name} (${typeLabel}${cameraNames ? ` · ${cameraNames}` : ''})`,
            value: s.id,
            type: s.type,
          };
        }),
    );

    function sensorById(id: string | undefined): ReactiveSensor | undefined {
      return id ? sensors.value.find((s) => s.id === id) : undefined;
    }

    return { sensorOptions, sensorById, isLoading };
  }

  function getPropertiesForSensor(sensorType: string, mode: 'observable' | 'writable' = 'observable') {
    const names = mode === 'writable' ? getWritableSensorProperties(sensorType) : getObservableSensorProperties(sensorType);
    return names.map((prop) => ({
      label: t(`components.automation_nodes.${sensorPropertyLabelKey(sensorType, prop)}`),
      value: prop,
    }));
  }

  return {
    cameras,
    cameraOptions,
    useSensorOptions,
    getPropertiesForSensor,
  };
}
