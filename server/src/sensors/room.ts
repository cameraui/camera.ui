import { RoomsService } from '../api/services/rooms.service.js';
import { inject } from '../container.js';

import type { DBSensor } from '../api/database/types.js';

export interface SensorRoom {
  id: string;
  name: string;
}

export function sensorRoomId(record: DBSensor): string | undefined {
  if (!record.boundCameraId) return record.roomId;
  return inject('dbs').camerasDB.get(record.boundCameraId)?.roomId ?? undefined;
}

export function resolveSensorRoom(record: DBSensor): SensorRoom | undefined {
  const id = sensorRoomId(record);
  const name = new RoomsService().label(id);
  return id && name ? { id, name } : undefined;
}
