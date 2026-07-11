import type { DBAutomation } from '@shared/types';
import type { Edge, Node } from '@vue-flow/core';

export type AutomationNodeCategory = 'trigger' | 'condition' | 'action' | 'utility';

export type TriggerNodeType =
  'trigger-detection' | 'trigger-sensor' | 'trigger-schedule' | 'trigger-webhook' | 'trigger-system' | 'trigger-manual' | 'trigger-geofence' | 'trigger-mqtt';

export type ConditionNodeType = 'condition-ifelse' | 'condition-switch' | 'condition-sensorstate' | 'condition-time';

export type ActionNodeType =
  | 'action-snapshot'
  | 'action-sensor'
  | 'action-notification'
  | 'action-http'
  | 'action-delay'
  | 'action-variable'
  | 'action-plugin'
  | 'action-image-input'
  | 'action-output'
  | 'action-camera-control'
  | 'action-mqtt';

export type AutomationNodeType = TriggerNodeType | ConditionNodeType | ActionNodeType;

export interface TriggerDetectionData {
  type: 'trigger-detection';
  cameraId: string;
  eventPhase: ('start' | 'end' | 'segment-start' | 'segment-update' | 'segment-end')[];
  detectionLabels: string[];
  confidenceThreshold: number;
  audioLabels: string[];
  faceFilter: string[];
  licensePlateFilter: string[];
}

export interface TriggerSensorData {
  type: 'trigger-sensor';
  cameraId: string;
  sensorType: string;
  sensorName: string;
  sensorPluginId: string;
  properties: string[];
}

export interface TriggerScheduleData {
  type: 'trigger-schedule';
  cron: string;
}

export interface TriggerWebhookData {
  type: 'trigger-webhook';
  webhookId: string;
  webhookSecret?: string;
}

export interface TriggerSystemData {
  type: 'trigger-system';
  category: 'system' | 'plugin' | 'camera';
  eventType: string;
  targetId: string;
}

export interface TriggerMqttData {
  type: 'trigger-mqtt';
  topic: string;
  payloadFilter: string;
}

export interface TriggerManualData {
  type: 'trigger-manual';
}

export interface ConditionIfElseData {
  type: 'condition-ifelse';
  leftOperand: string;
  operator: '==' | '!=' | '>' | '<' | '>=' | '<=' | 'contains' | 'startsWith' | 'endsWith';
  rightOperand: string;
}

export interface ConditionSwitchData {
  type: 'condition-switch';
  variable: string;
  cases: string[];
}

export interface ConditionSensorStateData {
  type: 'condition-sensorstate';
  cameraId: string;
  sensorType: string;
  sensorName: string;
  sensorPluginId: string;
  conditions: Array<{ property: string; expectedValue: string }>;
  logic: 'AND' | 'OR';
}

export interface ActionSnapshotData extends RepeatSettings {
  type: 'action-snapshot';
  cameraId: string;
  forceNew: boolean;
}

export interface RepeatSettings {
  repeat?: number;
  repeatDelayMs?: number;
  repeatConcurrency?: number;
}

export interface ActionSensorData {
  type: 'action-sensor';
  cameraId: string;
  sensorType: string;
  sensorName: string;
  sensorPluginId: string;
  properties: Array<{ property: string; value: string }>;
}

export interface ActionNotificationData {
  type: 'action-notification';
  title: string;
  body: string;
  severity: 'info' | 'warn' | 'error' | 'critical';
  deepLink: string;
  targets: string[];
  image?: string;
}

export interface ActionHttpData extends RepeatSettings {
  type: 'action-http';
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers: Record<string, string>;
  body: string;
}

export interface ActionMqttData extends RepeatSettings {
  type: 'action-mqtt';
  topic: string;
  payload: string;
  retain: boolean;
}

export interface ActionDelayData {
  type: 'action-delay';
  duration: number;
  unit: 'seconds' | 'minutes' | 'hours';
}

export interface ActionVariableData {
  type: 'action-variable';
  variableName: string;
  operator: '=' | '+=' | '-=';
  value: string;
}

export interface ActionPluginData extends RepeatSettings {
  type: 'action-plugin';
  pluginName: string;
  pluginInterface: string;
  method: string;
  params: Record<string, string>;
  config: Record<string, unknown>;
}

export interface TriggerGeofenceData {
  type: 'trigger-geofence';
  geofenceId: string;
  geofenceUserSecrets?: Record<string, string>;
  zoneName: string;
  latitude: number;
  longitude: number;
  radius: number;
  event: 'enter' | 'leave' | 'both';
  users: string[];
}

export interface ConditionTimeData {
  type: 'condition-time';
  startTime: string;
  endTime: string;
  days: number[];
}

export interface ActionCameraControlData {
  type: 'action-camera-control';
  cameraId: string;
  properties: Array<{ property: string; value: string }>;
}

export interface ActionImageInputData {
  type: 'action-image-input';
  source: string;
  variableName: string;
  resizeWidth?: number;
  resizeHeight?: number;
  resizeFit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
  outputFormat?: 'jpeg' | 'raw-rgb' | 'raw-rgba' | 'raw-gray';
}

export interface ActionOutputData {
  type: 'action-output';
  variables: Array<{ label: string; value: string }>;
}

export type AutomationNodeData =
  | TriggerDetectionData
  | TriggerSensorData
  | TriggerScheduleData
  | TriggerWebhookData
  | TriggerSystemData
  | TriggerManualData
  | TriggerGeofenceData
  | TriggerMqttData
  | ConditionIfElseData
  | ConditionSwitchData
  | ConditionSensorStateData
  | ConditionTimeData
  | ActionSnapshotData
  | ActionSensorData
  | ActionNotificationData
  | ActionHttpData
  | ActionMqttData
  | ActionDelayData
  | ActionVariableData
  | ActionPluginData
  | ActionCameraControlData
  | ActionImageInputData
  | ActionOutputData;

// All node data types may have an optional alias for scoped variable output
export type AliasedNodeData = AutomationNodeData & { alias?: string };

export type AutomationNode = Node<AutomationNodeData, Record<string, never>, AutomationNodeType>;
export type AutomationEdge = Edge<{ label?: string }>;

export type FlowRunStatus = 'success' | 'error' | 'running' | 'idle';

export interface AutomationFlow {
  _id: string;
  name: string;
  enabled: boolean;
  nodes: AutomationNode[];
  edges: AutomationEdge[];
  suppressDuplicates: boolean;
  singleExecution: boolean;
  requiresUpdate?: boolean;
  lastRun?: {
    status: FlowRunStatus;
    timestamp: number;
    error?: string;
  };
  createdAt: number;
  updatedAt: number;
}

export interface AutomationBlueprint {
  version: 1;
  name: string;
  description?: string;
  nodes: AutomationNode[];
  edges: AutomationEdge[];
}

export type AutomationInputType = 'camera' | 'plugin' | 'sensor' | 'notification-targets' | 'system-target';

export interface AutomationBlueprintInput {
  key: string;
  type: AutomationInputType;
  label?: string;
  interface?: string;
  multiple?: boolean;
}

export interface AutomationStoreBlueprint extends AutomationBlueprint {
  inputs?: AutomationBlueprintInput[];
}

export interface NodeDefinition {
  type: AutomationNodeType;
  category: AutomationNodeCategory;
  labelKey: string;
  descriptionKey: string;
  icon: Component;
  color: string;
  defaults: AutomationNodeData;
  supportsRepeat?: boolean;
}

export function getNodeCategory(type: AutomationNodeType): AutomationNodeCategory {
  if (type.startsWith('trigger-')) return 'trigger';
  if (type.startsWith('condition-')) return 'condition';
  if (type === 'action-image-input' || type === 'action-output') return 'utility';
  return 'action';
}

export const CATEGORY_COLORS: Record<AutomationNodeCategory, string> = {
  trigger: '#22c55e',
  condition: '#f59e0b',
  action: '#3b82f6',
  utility: '#8b5cf6',
};

export interface CuiAutomationToolbarProps {
  flow: AutomationFlow;
}

export interface CuiAutomationToolbarEmits {
  (e: 'update:name', name: string): void;
  (e: 'toggle-enabled'): void;
  (e: 'toggle-suppress-duplicates'): void;
  (e: 'toggle-single-execution'): void;
}

export interface CuiAutomationFlowCardProps {
  flow: DBAutomation;
}

export interface CuiAutomationFlowCardEmits {
  (e: 'click'): void;
  (e: 'toggle', value: boolean): void;
  (e: 'delete'): void;
}

export interface CuiAutomationNodeConfigProps {
  node: AutomationNode;
}

export interface CuiAutomationNodeConfigEmits {
  (e: 'close'): void;
  (e: 'update:data', data: Partial<AutomationNodeData>): void;
  (e: 'delete'): void;
}

export interface CuiAutomationCanvasProps {
  flow: AutomationFlow;
  mobile?: boolean;
}

export interface CuiAutomationCanvasEmits {
  (e: 'node-select', nodeId: string | null): void;
  (e: 'change'): void;
}

export interface CuiAutomationNodePaletteProps {
  mode?: 'drag' | 'click';
}

export interface CuiAutomationNodePaletteEmits {
  (e: 'node-click', type: AutomationNodeType): void;
}

export const CUI_AUTOMATION_NODE_PALETTE_DEFAULTS: { mode: 'drag' | 'click' } = {
  mode: 'drag',
};

export interface CuiAutomationMobileNodeConfigProps {
  node: {
    id: string;
    type?: string;
    data: AutomationNodeData;
  };
}

export interface ConfigNodeUpdateEmits {
  (e: 'update:data', data: Record<string, unknown>): void;
}

export interface ConfigNodeProps<T extends AutomationNodeData> {
  data: T;
}

export interface ConfigNodePropsWithId<T extends AutomationNodeData> extends ConfigNodeProps<T> {
  nodeId: string;
}

export interface ConfigActionHttpProps {
  data: ActionHttpData;
  nodeId: string;
}

export interface ConfigActionPluginProps {
  data: ActionPluginData;
  nodeId: string;
}

export interface ConfigActionSensorProps {
  data: ActionSensorData;
}

export interface ConfigActionVariableProps {
  data: ActionVariableData;
  nodeId: string;
}

export interface ConfigActionSnapshotProps {
  data: ActionSnapshotData;
}

export interface ConfigActionCameraControlProps {
  data: ActionCameraControlData;
}

export interface CameraControlPropertyDefinition {
  key: string;
  labelKey: string;
  inputType: 'boolean' | 'number' | 'select';
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ label: string; value: string }>;
  defaultValue: string;
}

export const CAMERA_CONTROL_PROPERTY_DEFINITIONS: CameraControlPropertyDefinition[] = [
  { key: 'detectionSettings.snooze', labelKey: 'components.automation_nodes.camera_prop_snooze', inputType: 'boolean', defaultValue: 'false' },
  { key: 'disabled', labelKey: 'components.automation_nodes.camera_prop_disabled', inputType: 'boolean', defaultValue: 'false' },
  {
    key: 'detectionSettings.object.confidence',
    labelKey: 'components.automation_nodes.camera_prop_object_confidence',
    inputType: 'number',
    min: 0.3,
    max: 1,
    step: 0.05,
    defaultValue: '0.5',
  },
  { key: 'detectionSettings.motion.timeout', labelKey: 'components.automation_nodes.camera_prop_motion_timeout', inputType: 'number', min: 10, defaultValue: '30' },
  {
    key: 'detectionSettings.motion.resolution',
    labelKey: 'components.automation_nodes.camera_prop_motion_resolution',
    inputType: 'select',
    options: [
      { label: 'Low', value: 'low' },
      { label: 'Medium', value: 'medium' },
      { label: 'High', value: 'high' },
    ],
    defaultValue: 'low',
  },
  { key: 'detectionSettings.audio.timeout', labelKey: 'components.automation_nodes.camera_prop_audio_timeout', inputType: 'number', min: 10, defaultValue: '30' },
  {
    key: 'detectionSettings.audio.minDecibels',
    labelKey: 'components.automation_nodes.camera_prop_audio_min_decibels',
    inputType: 'number',
    min: -100,
    max: 0,
    defaultValue: '-40',
  },
  { key: 'detectionSettings.sensor.timeout', labelKey: 'components.automation_nodes.camera_prop_sensor_timeout', inputType: 'number', min: 10, defaultValue: '30' },
  { key: 'detectionSettings.cascadeDetection', labelKey: 'components.automation_nodes.camera_prop_cascade_detection', inputType: 'boolean', defaultValue: 'true' },
  {
    key: 'detectionSettings.cascadeTimeout',
    labelKey: 'components.automation_nodes.camera_prop_cascade_timeout',
    inputType: 'number',
    min: 1,
    max: 300,
    defaultValue: '10',
  },
  { key: 'frameWorkerSettings.fps', labelKey: 'components.automation_nodes.camera_prop_fps', inputType: 'number', min: 0, max: 30, defaultValue: '10' },
  { key: 'snapshotSettings.autoRefresh', labelKey: 'components.automation_nodes.camera_prop_auto_refresh', inputType: 'boolean', defaultValue: 'false' },
  { key: 'snapshotSettings.interval', labelKey: 'components.automation_nodes.camera_prop_snapshot_interval', inputType: 'number', min: 10, max: 60, defaultValue: '60' },
  { key: 'snapshotSettings.ttl', labelKey: 'components.automation_nodes.camera_prop_snapshot_ttl', inputType: 'number', min: 10, max: 60, defaultValue: '50' },
];

export interface ConfigActionDelayProps {
  data: ActionDelayData;
}

export interface ConfigActionImageInputProps {
  data: ActionImageInputData;
  nodeId: string;
}

export interface ConfigActionNotificationProps {
  data: ActionNotificationData;
  nodeId: string;
}

export interface ConfigActionOutputProps {
  data: ActionOutputData;
  nodeId: string;
}

export interface ConfigConditionIfElseProps {
  data: ConditionIfElseData;
  nodeId: string;
}

export interface ConfigConditionSwitchProps {
  data: ConditionSwitchData;
  nodeId: string;
}

export interface ConfigConditionSensorStateProps {
  data: ConditionSensorStateData;
  nodeId: string;
}

export interface ConfigConditionTimeProps {
  data: ConditionTimeData;
  nodeId: string;
}

export interface ConfigTriggerDetectionProps {
  data: TriggerDetectionData;
}

export interface ConfigTriggerSensorProps {
  data: TriggerSensorData;
}

export interface ConfigTriggerScheduleProps {
  data: TriggerScheduleData;
}

export interface ConfigTriggerWebhookProps {
  data: TriggerWebhookData;
}

export interface ConfigTriggerMqttProps {
  data: TriggerMqttData;
}

export interface ConfigActionMqttProps {
  data: ActionMqttData;
  nodeId: string;
}

export interface ConfigTriggerSystemProps {
  data: TriggerSystemData;
}

export interface ConfigTriggerManualProps {
  data: TriggerManualData;
}

export interface ConfigTriggerGeofenceProps {
  data: TriggerGeofenceData;
}

export interface VariableSuggestionsProps {
  variables: { label: string; value: string }[];
}

export interface VariableSuggestionsEmits {
  (e: 'select', value: string): void;
}

export interface VariableInputProps {
  modelValue: string;
  nodeId: string;
  placeholder?: string;
}

export interface VariableInputEmits {
  (e: 'update:modelValue', value: string): void;
}
