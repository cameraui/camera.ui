import { usePTZControl } from '@camera.ui/browser';
import { PTZCapability, PTZProperty } from '@camera.ui/sdk';

import { extractErrorMessage } from '@/common/utils.js';

import type { ReactiveCameraDevice } from '@camera.ui/browser';
import type { MaybeRefOrGetter } from 'vue';

export function useCameraPtz(camera: MaybeRefOrGetter<ReactiveCameraDevice | undefined>) {
  const toast = useCuiToast();
  const { sensor } = usePTZControl(camera);

  const hasPan = computed(() => sensor.value?.hasCapability(PTZCapability.Pan) ?? false);
  const hasTilt = computed(() => sensor.value?.hasCapability(PTZCapability.Tilt) ?? false);
  const hasZoom = computed(() => sensor.value?.hasCapability(PTZCapability.Zoom) ?? false);
  const hasHome = computed(() => sensor.value?.hasCapability(PTZCapability.Home) ?? false);
  const hasPanTilt = computed(() => hasPan.value || hasTilt.value);

  const presets = computed(() => sensor.value?.getProperty(PTZProperty.Presets) ?? []);
  const hasPresets = computed(() => (sensor.value?.hasCapability(PTZCapability.Presets) ?? false) && presets.value.length > 0);

  async function goToHome(): Promise<void> {
    try {
      await sensor.value?.setProperty(PTZProperty.Position, { pan: 0, tilt: 0, zoom: 0 });
    } catch (error) {
      toast.add({ severity: 'error', detail: extractErrorMessage(error), life: 3000 });
    }
  }

  async function goToPreset(preset: string): Promise<void> {
    try {
      await sensor.value?.setProperty(PTZProperty.TargetPreset, preset);
    } catch (error) {
      toast.add({ severity: 'error', detail: extractErrorMessage(error), life: 3000 });
    }
  }

  return { sensor, hasPan, hasTilt, hasZoom, hasPanTilt, hasHome, hasPresets, presets, goToHome, goToPreset };
}
