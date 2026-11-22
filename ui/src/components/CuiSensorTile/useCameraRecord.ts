import { CamerasQuery } from '@/api/routes/cameras.js';

export function useCameraName(cameraId: string | undefined) {
  const camera = useCameraRecord(cameraId);
  return computed(() => camera.value?.name);
}

export function useCameraRecord(cameraId: string | undefined) {
  const { data } = new CamerasQuery().getCamerasQuery({ page: 1, pageSize: -1 }, !!cameraId);
  return computed(() => data.value?.result.find((camera) => camera._id === cameraId));
}
