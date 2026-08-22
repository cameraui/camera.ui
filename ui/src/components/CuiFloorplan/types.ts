export const FLOORPLAN_UNITS_PER_METER = 100;
export const FLOORPLAN_GRID = 16;
export const FLOORPLAN_DOT = 1;
export const FLOORPLAN_SNAP = 10;
export const SNAP_PX = 10;
export const FLOORPLAN_MIN_ROOM = 60;
export const ROOM_LABEL_SIZE = 15;
export const ROOM_LABEL_MIN = 9;
export const ROOM_LABEL_ASPECT = 0.55;
export const FLOORPLAN_ZOOM_RANGE = { min: 0.2, max: 3 };
export const FLOORPLAN_CAMERA_RANGE = { min: 100, max: 3000 };

export interface FloorplanLevel {
  id: string;
  name: string;
}

export interface FloorplanRoom {
  id: string;
  roomId: string;
  name: string;
  note: string;
  levelId: string;
  outdoor: boolean;
  publicSpace: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FloorplanCamera {
  id: string;
  name: string;
  levelId: string;
  roomId: string;
  note: string;
  x: number;
  y: number;
  rotation: number;
  fov: number;
  range: number;
}

export interface FloorplanSensor {
  id: string;
  name: string;
  owner: string;
  sensorType: string;
  levelId: string;
  roomId: string;
  connectionId: string | null;
  note: string;
  x: number;
  y: number;
}

export type FloorplanConnectionType = 'door' | 'opening' | 'stairs';

export const FLOORPLAN_CONNECTION_TYPES: FloorplanConnectionType[] = ['door', 'opening', 'stairs'];

export const FLOORPLAN_DOOR_WIDTH = 90;
export const FLOORPLAN_PASSAGE_RANGE = { min: 40, max: 400 };
export const FLOORPLAN_NOTE_MAX = 240;
export const FLOORPLAN_DRAG_TYPE = 'application/floorplanitem';

export interface FloorplanConnection {
  id: string;
  fromRoomId: string;
  toRoomId: string;
  fromShapeId: string | null;
  toShapeId: string | null;
  offset: number | null;
  width: number;
  note: string;
  type: FloorplanConnectionType;
}

export interface FloorplanSelection {
  kind: 'room' | 'camera' | 'connection' | 'sensor';
  id: string;
}

export interface CuiFloorplanCanvasProps {
  mobile?: boolean;
  bottomInset?: number;
  bottomInsetDragging?: boolean;
  levels: FloorplanLevel[];
  rooms: FloorplanRoom[];
  connections: FloorplanConnection[];
  cameras: FloorplanCamera[];
  sensors: FloorplanSensor[];
  levelId: string;
  selection?: FloorplanSelection | null;
  north?: number | null;
  readOnly?: boolean;
}

export interface CuiFloorplanCanvasEmits {
  select: [FloorplanSelection | null];
  history: [];
  'move-room': [{ id: string; x: number; y: number }];
  'resize-room': [{ id: string; width: number; height: number }];
  'move-camera': [{ id: string; x: number; y: number }];
  'rotate-camera': [{ id: string; rotation: number; range: number }];
  'create-connection': [{ fromRoomId: string; toRoomId: string; fromShapeId: string; toShapeId: string }];
  'move-connection': [{ id: string; offset: number }];
  'resize-connection': [{ id: string; offset: number; width: number }];
  drop: [{ kind: 'room' | 'camera' | 'sensor'; cameraId?: string; sensorId?: string; sensorType?: string; roomId?: string; x: number; y: number }];
  'update-north': [number];
  'request-stairs': [{ roomId: string; event: PointerEvent }];
  'settle-room': [string];
  'hover-camera': [{ cameraId: string; x: number; y: number } | null];
  'move-sensor': [{ id: string; x: number; y: number }];
  'hover-sensor': [{ sensorId: string; x: number; y: number } | null];
}

export interface FloorplanPaletteCamera {
  id: string;
  name: string;
}

export interface FloorplanPaletteSensor {
  id: string;
  name: string;
  subtitle: string;
  sensorType: string;
}

export interface FloorplanPaletteRoom {
  id: string;
  name: string;
}

export interface CuiFloorplanPaletteProps {
  cameras: FloorplanPaletteCamera[];
  sensors: FloorplanPaletteSensor[];
  rooms: FloorplanPaletteRoom[];
  mode?: 'drag' | 'click';
  disabled?: boolean;
}

export interface CuiFloorplanPaletteEmits {
  pick: [{ kind: 'room' | 'camera' | 'sensor'; cameraId?: string; sensorId?: string; sensorType?: string; roomId?: string }];
}

export interface CuiFloorplanInspectorProps {
  fluid?: boolean;
  rooms: FloorplanRoom[];
  connections: FloorplanConnection[];
  cameras: FloorplanCamera[];
  sensors: FloorplanSensor[];
  levels: FloorplanLevel[];
  selection?: FloorplanSelection | null;
  readOnly?: boolean;
}

export interface CuiFloorplanInspectorEmits {
  close: [];
  'update-room': [{ id: string; patch: Partial<FloorplanRoom> }];
  'update-camera': [{ id: string; patch: Partial<FloorplanCamera> }];
  'update-sensor': [{ id: string; patch: Partial<FloorplanSensor> }];
  'update-connection': [{ id: string; patch: Partial<FloorplanConnection> }];
  remove: [FloorplanSelection];
}
