import type { ReactiveSensor } from '@camera.ui/browser';
import type {
  DBAutomation,
  DBCamera,
  DBCamviewCardFit,
  DBHomeAction,
  DBHomeBreakpoint,
  DBHomeCameraFollow,
  DBHomeDockKey,
  DBHomePage,
  DBHomeWidget,
  DBHomeWidgetKind,
  DBHomeWidgetPosition,
} from '@shared/types';
import type { GridStackNode } from 'gridstack';
import type { Component } from 'vue';
import type { CameraActivity } from '../CuiFloorplan/utils.js';
import type { MenuItem } from '../CuiMenu/types.js';

export interface HomeCellSize {
  w: number;
  h: number;
}

export interface HomeCellPosition {
  x: number;
  y: number;
}

export type HomeSizeLabel = 'mini' | 'small' | 'medium' | 'large' | 'full' | 'row' | 'tile' | 'widget';

export interface HomeSize {
  label: HomeSizeLabel;
  cells: Record<DBHomeBreakpoint, HomeCellSize>;
}

export interface HomeSizeRange {
  w: [number, number];
  h: [number, number];
}

export interface HomeWidgetSpec {
  initial: string;
  sizes: Record<string, HomeSize>;
  range?: HomeSizeRange;
}

export interface HomeSizeOption {
  name: string;
  label: HomeSizeLabel;
  size: HomeCellSize;
}

export interface HomePlacement {
  widget: DBHomeWidget;
  spec: HomeWidgetSpec;
}

export type HomeEntry = HomePlacement &
  (
    | { kind: 'camera'; camera: DBCamera; group: DBCamera[] }
    | { kind: 'sensor'; sensor: ReactiveSensor }
    | { kind: 'notes' | 'events'; content: HomePageContent; scope: string; room?: string }
    | { kind: 'lights'; lights: ReactiveSensor[]; room?: string }
    | { kind: 'automation'; automation: DBAutomation }
    | { kind: 'floorplan'; level: HomeLevel; hiddenRooms: string[] }
    | { kind: 'group'; name: string; sensors: ReactiveSensor[]; own: boolean; design?: HomeGroupDesign }
    | { kind: 'clock' }
    | { kind: 'action'; actions: DBHomeAction[]; cameras: DBCamera[]; scope: string; place: string; all: boolean }
    | { kind: 'loading' }
  );

export interface HomeDevice {
  id: string;
  name: string;
  sensors: ReactiveSensor[];
}

export interface HomeLevel {
  id: string;
  name: string;
}

export interface HomeDetection {
  type: string;
  time: number;
  active: boolean;
}

export interface HomeGridItem extends DBHomeWidgetPosition {
  id: string;
  sizes: HomeSizeOption[];
  range?: HomeSizeRange;
}

export interface HomeGridFolder {
  node: GridStackNode;
  label: string;
  middle?: boolean;
  closest: number;
  // where gridstack would have put the drag, a drop before the folder is ready lands there
  cell?: HomeCellPosition;
  armed: boolean;
  held: boolean;
  timer?: ReturnType<typeof setTimeout>;
}

export interface HomeRoom {
  id: string;
  name: string;
  cameras: DBCamera[];
  tiles: ReactiveSensor[];
  batteries: ReactiveSensor[];
}

export interface HomePageContent {
  cameras: DBCamera[];
  tiles: ReactiveSensor[];
  batteries: ReactiveSensor[];
}

export interface HomePageTab {
  id: string;
  name: string;
  hidden?: boolean;
}

export type HomeNoteKind = 'alarm' | 'open' | 'unlocked' | 'battery' | 'offline';

export interface HomeNote {
  kind: HomeNoteKind;
  sensors: ReactiveSensor[];
}

export interface HomeDockCategory {
  key: Exclude<DBHomeDockKey, 'cameras'>;
  types: string[];
}

export interface HomeDockItem {
  key: DBHomeDockKey;
  icon: Component;
  label: string;
  state: string;
  active: boolean;
  color?: string;
}

export interface HomeLibraryItem {
  widget: DBHomeWidget;
  spec: HomeWidgetSpec;
  icon: Component;
  label: string;
  detail?: string;
  shown: boolean;
}

export interface HomeLibrarySection {
  key: string;
  label: string;
  items: HomeLibraryItem[];
}

export interface CuiHomeGridProps {
  items: HomeGridItem[];
  columns: number;
  gap: number;
  editing: boolean;
  groupAction?: (id: string, target: string) => string | undefined;
}

export interface CuiHomeGridEmits {
  (e: 'layout', positions: Record<string, DBHomeWidgetPosition>): void;
  (e: 'drop', id: string, position: DBHomeWidgetPosition): void;
  (e: 'group', id: string, target: string, at: HomeCellPosition): void;
}

export interface CuiHomeWidgetProps {
  entry: HomeEntry;
  size: HomeCellSize;
  sizes: HomeSizeOption[];
  editing: boolean;
  cameras: DBCamera[];
  scopes: HomePageTab[];
  roomNames: Map<string, string>;
  detections: Map<string, HomeDetection>;
  activity: Map<string, CameraActivity>;
}

export type HomeWidgetPatch = Partial<Pick<DBHomeWidget, 'fit' | 'cameras' | 'rotate' | 'follow' | 'name' | 'sensors' | 'room' | 'actions' | 'minutes'>>;

export interface CuiHomeWidgetEmits {
  (e: 'remove'): void;
  (e: 'resize', size: HomeCellSize): void;
  (e: 'update', patch: HomeWidgetPatch): void;
  (e: 'take', sensorId: string): void;
  (e: 'dissolve'): void;
}

export interface HomeCameraTool {
  key: string;
  label: string;
  icon: Component;
  on?: boolean;
  busy?: boolean;
  run: () => void;
}

export interface CuiHomeCameraProps {
  camera: DBCamera;
  cameras: DBCamera[];
  fit: DBCamviewCardFit;
  rotate?: number;
  follow?: DBHomeCameraFollow;
  roomNames: Map<string, string>;
  detections: Map<string, HomeDetection>;
  activity: Map<string, CameraActivity>;
  editing: boolean;
}

export interface HomeGroupDesign {
  key: string;
  component: Component;
  core: readonly string[];
  extras?: readonly string[];
}

export interface CuiHomeGroupDesignProps {
  name: string;
  sensors: ReactiveSensor[];
  disabled: boolean;
}

export interface CuiHomeTileGridProps {
  sensors: ReactiveSensor[];
  disabled: boolean;
}

export interface CuiHomeLightsProps extends CuiHomeGroupDesignProps {
  room?: string;
  row?: boolean;
}

export interface CuiHomeGroupMembersProps {
  name?: string;
  placeholder: string;
  sensors: ReactiveSensor[];
}

export interface CuiHomeGroupMembersEmits {
  (e: 'update', patch: HomeWidgetPatch): void;
  (e: 'take', sensorId: string): void;
}

export interface CuiHomeLightChipProps {
  sensor: ReactiveSensor;
  disabled: boolean;
}

export interface CuiHomeSceneProps {
  automation: DBAutomation;
  row: boolean;
}

export interface CuiHomeFloorplanProps {
  level: HomeLevel;
  hiddenRooms: string[];
}

export type HomePlanOpening = 'door' | 'window' | 'gate';

export interface HomePlanRoom {
  id: string;
  name: string;
  temperature?: string;
  status?: string;
  lit: boolean;
  motion: boolean;
  camera?: DBCamera;
  devices: number;
  alert: boolean;
}

export interface CuiHomePlanRoomProps {
  room: HomePlanRoom;
}

export interface CuiHomeCameraOptionsProps {
  widget: DBHomeWidget;
  camera: DBCamera;
  cameras: DBCamera[];
  roomNames: Map<string, string>;
}

export interface CuiHomeCameraOptionsEmits {
  (e: 'update', patch: HomeWidgetPatch): void;
}

export interface CuiHomeNotesProps {
  tiles: ReactiveSensor[];
  batteries: ReactiveSensor[];
  room?: string;
}

export interface CuiHomeEventsProps {
  cameras: DBCamera[];
  room?: string;
  pending?: boolean;
}

export type HomeActionMode = 'idle' | 'on' | 'partial' | 'na';

export type HomeActionReason = 'no_cameras' | 'no_cameras_room' | 'no_nvr' | 'no_recording' | 'notifications_off';

export interface HomeActionCamera {
  camera: DBCamera;
  on: boolean;
  since?: number;
  until?: number;
}

export interface HomeActionLook {
  icon: Component;
  onIcon: Component;
  goIcon: Component;
  backIcon: Component;
  color: string;
  admin: boolean;
  hold: boolean;
}

export interface HomeActionPress {
  resumes: boolean;
  label: string;
  short: string;
  guarded: boolean;
  run: () => void;
}

export interface HomeActionState {
  action: DBHomeAction;
  mode: HomeActionMode;
  pending?: 'on' | 'off';
  cameras: HomeActionCamera[];
  count: number;
  since?: number;
  until?: number;
  share?: number;
  reason?: HomeActionReason;
  durations: number[];
  minutes: number;
}

export interface CuiHomeActionProps {
  actions: DBHomeAction[];
  cameras: DBCamera[];
  place: string;
  all: boolean;
  minutes: number;
}

export interface CuiHomeActionCardProps extends CuiHomeActionProps {
  row: boolean;
}

export interface CuiHomeActionTileProps {
  state: HomeActionState;
  press?: HomeActionPress;
  horizontal: boolean;
  labeled: boolean;
  detailed: boolean;
}

export interface CuiHomeActionTileEmits {
  (e: 'hint', shown: boolean): void;
}

export interface CuiHomeActionDetailsProps {
  states: HomeActionState[];
}

export interface CuiHomeActionDetailsEmits {
  (e: 'go', action: DBHomeAction, minutes: number): void;
  (e: 'back', action: DBHomeAction): void;
  (e: 'extend', action: DBHomeAction): void;
}

export interface CuiHomeActionOptionsProps {
  actions: DBHomeAction[];
  minutes: number;
}

export interface CuiHomeActionOptionsEmits {
  (e: 'update', patch: HomeWidgetPatch): void;
}

export interface CuiHomeScopeOptionsProps {
  scope: string;
  pages: HomePageTab[];
}

export interface CuiHomeScopeOptionsEmits {
  (e: 'update', patch: HomeWidgetPatch): void;
}

export interface CuiHomeHeaderProps {
  pages: HomePageTab[];
  profile: CuiHomeProfileMenuProps;
  editing: boolean;
  saving: boolean;
  panelOpen: boolean;
  arrangeable: boolean;
}

export interface CuiHomeActionsProps {
  profile: CuiHomeProfileMenuProps;
  editing: boolean;
  saving: boolean;
  panelOpen: boolean;
  arrangeable: boolean;
}

export interface CuiHomeProfileMenuProps {
  name: string;
  pinned: boolean;
  named: boolean;
  items: MenuItem[];
  floating?: boolean;
}

export interface CuiHomeRoomMenuProps {
  pages: HomePageTab[];
  editing: boolean;
}

export interface CuiHomeRoomListProps {
  pages: HomePageTab[];
}

export interface CuiHomeRoomListEmits {
  (e: 'reorder', ids: string[]): void;
  (e: 'hide', id: string, hidden: boolean): void;
}

export interface CuiHomeActionsEmits {
  (e: 'edit'): void;
  (e: 'cancel'): void;
  (e: 'done'): void;
  (e: 'panel'): void;
  (e: 'arrange'): void;
}

export interface CuiHomeHeaderEmits extends CuiHomeActionsEmits {
  (e: 'reorder', ids: string[]): void;
  (e: 'hide', id: string, hidden: boolean): void;
}

export interface CuiHomeGroupProps {
  name: string;
  sensors: ReactiveSensor[];
  own: boolean;
  editing: boolean;
  disabled: boolean;
}

export interface CuiHomeGroupEmits {
  (e: 'update', patch: HomeWidgetPatch): void;
  (e: 'take', sensorId: string): void;
}

export interface CuiHomePagerProps<T> {
  items: T[];
  rowHeight: number;
  minWidth: number;
  itemKey: (item: T) => string;
}

export interface CuiHomeSkeletonProps {
  columns: number;
  gap: number;
}

export interface HomeArrangeItem extends DBHomeWidgetPosition {
  id: string;
  kind: DBHomeWidgetKind;
  range?: HomeSizeRange;
}

export interface CuiHomeDockProps {
  cameras: DBCamera[];
  tiles: ReactiveSensor[];
  roomNames: Map<string, string>;
  inline: boolean;
  editing: boolean;
}

export interface CuiHomeDockItemProps {
  item: HomeDockItem;
  inline: boolean;
  editing: boolean;
  open: boolean;
  dragging: boolean;
}

export interface HomePoint {
  clientX: number;
  clientY: number;
}

export interface CuiHomeDockItemEmits {
  (e: 'select'): void;
  (e: 'remove'): void;
  (e: 'drag', pointer: HomePoint): void;
  (e: 'drop'): void;
}

export interface CuiHomeDockPanelProps {
  item: HomeDockItem;
  cameras: DBCamera[];
  tiles: ReactiveSensor[];
  roomNames: Map<string, string>;
  inline: boolean;
}

export interface CuiHomeDockPanelEmits {
  (e: 'close'): void;
}

export interface CuiHomeEditPanelProps {
  page: DBHomePage;
  sections: HomeLibrarySection[];
  breakpoint: DBHomeBreakpoint;
  floating: boolean;
  right: number;
  top: number;
}

export interface CuiHomeCameraFlowProps {
  ids: string[];
  gap: number;
  editing: boolean;
  loading: boolean;
}

export interface CuiHomeCameraFlowEmits {
  (e: 'reorder', ids: string[]): void;
  (e: 'drop', id: string, index: number): void;
}

export interface CuiHomeEventsFilterProps {
  cameras: DBCamera[];
  label?: string;
}

export interface CuiHomeEditPanelEmits {
  (e: 'add', widget: DBHomeWidget, size: HomeCellSize): void;
  (e: 'auto-add', value: boolean): void;
  (e: 'show-dock', value: boolean): void;
  (e: 'clear'): void;
  (e: 'reset'): void;
}
