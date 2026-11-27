import { useAllSensors } from '@camera.ui/browser';
import { SensorType } from '@camera.ui/sdk';

import { getAutomationsFn } from '@/api/routes/automations.js';
import { CamerasQuery } from '@/api/routes/cameras.js';
import { RoomsQuery } from '@/api/routes/rooms.js';
import { SensorsQuery } from '@/api/routes/sensors.js';
import { cameraActivity } from '@/components/CuiFloorplan/utils.js';
import { sortByOrder } from '@/utils/cameraOrder.js';

import { buildHomeRooms, hasHomeTile, runsByHand, showsOnHome } from './home.js';

import type { HomeDevice, HomeLevel } from './types.js';

export function useHomeData() {
  const { data: cameraList } = new CamerasQuery().getCamerasQuery({ page: 1, pageSize: -1 });
  const { data: sensorList } = new SensorsQuery().getSensorsQuery();
  const { data: catalog } = new RoomsQuery().getRoomsQuery();
  const { sensors: live, isLoading: sensorsLoading } = useAllSensors();
  const { uiSettings } = storeToRefs(useUiStore());
  const admin = hasPermission(undefined, 'admin');
  const { data: automations, isFetched: automationsFetched } = useQueryEnhanced({
    queryKey: ['automationsList'],
    queryFn: ({ signal }) => getAutomationsFn({ signal }),
    enabled: admin,
  });

  const cameras = computed(() => sortByOrder(cameraList.value?.result ?? [], uiSettings.value.cameras.order || []));
  const canControl = canControlSensors();
  const tiles = computed(() => {
    const shown = new Set((sensorList.value ?? []).filter(showsOnHome).map((sensor) => sensor.id));
    return live.value.filter((sensor) => shown.has(sensor.id) && (canControl || sensor.type !== SensorType.Scene));
  });

  const devices = computed(() => {
    const byId = new Map(live.value.map((sensor) => [sensor.id, sensor]));
    const found = new Map<string, HomeDevice>();
    for (const sensor of sensorList.value ?? []) {
      const member = byId.get(sensor.id);
      if (!sensor.device || !member || !hasHomeTile(sensor)) continue;
      const device = found.get(sensor.device.id) ?? { id: sensor.device.id, name: sensor.device.name, sensors: [] };
      device.sensors.push(member);
      found.set(device.id, device);
    }
    return [...found.values()].filter((device) => device.sensors.length > 1);
  });

  const batteries = computed(() => live.value.filter((sensor) => sensor.type === SensorType.Battery));
  const activity = computed(() => cameraActivity(live.value));
  const rooms = computed(() => buildHomeRooms(catalog.value, cameras.value, tiles.value, batteries.value));
  const roomNames = computed(() => new Map((catalog.value?.rooms ?? []).map((room) => [room.id, room.name])));
  const scenes = computed(() => (automations.value ?? []).filter(runsByHand));
  const levels = computed<HomeLevel[]>(() =>
    [...(catalog.value?.levels ?? [])]
      .sort((a, b) => a.order - b.order)
      .filter((level) => catalog.value?.rooms.some((room) => room.levelId === level.id))
      .map(({ id, name }) => ({ id, name })),
  );

  const waiting = computed(() => ({
    cameras: !cameraList.value,
    sensors: !sensorList.value || sensorsLoading.value,
    rooms: !catalog.value,
    automations: admin && !automationsFetched.value,
  }));
  const ready = computed(() => !Object.values(waiting.value).some(Boolean));

  return { cameras, tiles, devices, batteries, rooms, roomNames, scenes, levels, activity, waiting, ready };
}
