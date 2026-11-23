import { RoomsService } from '../api/services/rooms.service.js';
import { inject } from '../container.js';

import type { DBSensor } from '../api/database/types.js';

export interface SensorRoom {
  id: string;
  name: string;
}

export function resolveSensorRoom(record: DBSensor): SensorRoom | undefined {
  const dbs = inject('dbs');
  const roomId = record.boundCameraId
    ? dbs.camerasDB.get(record.boundCameraId)?.roomId
    : (record.roomId ?? dbs.floorPlanDB.get('floorplan')?.sensors.find((placement) => placement.sensorId === record._id)?.roomId);
  const name = new RoomsService().label(roomId);
  return roomId && name ? { id: roomId, name } : undefined;
}
