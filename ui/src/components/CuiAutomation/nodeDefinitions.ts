import SensorIcon from '~icons/mdi/access-point';
import NotificationIcon from '~icons/mdi/bell-outline';
import CameraIcon from '~icons/mdi/camera';
import CameraControlIcon from '~icons/mdi/camera-control';
import TimeRangeIcon from '~icons/mdi/clock-check-outline';
import ClockIcon from '~icons/mdi/clock-outline';
import CodeBracesIcon from '~icons/mdi/code-braces';
import CogIcon from '~icons/mdi/cog-outline';
import OutputIcon from '~icons/mdi/export-variant';
import FlashIcon from '~icons/mdi/flash';
import HandIcon from '~icons/mdi/gesture-tap';
import ImageIcon from '~icons/mdi/image-outline';
import LightbulbIcon from '~icons/mdi/lightbulb-outline';
import MapPinIcon from '~icons/mdi/map-marker-radius';
import PluginIcon from '~icons/mdi/puzzle-outline';
import GitBranchIcon from '~icons/mdi/source-branch';
import MqttIcon from '~icons/mdi/transit-connection-variant';
import TimerIcon from '~icons/mdi/timer-sand';
import VariableIcon from '~icons/mdi/variable';
import HttpIcon from '~icons/mdi/web';
import WebhookIcon from '~icons/mdi/webhook';

import type { NodeDefinition } from './types.js';

export const NODE_DEFINITIONS: NodeDefinition[] = [
  {
    type: 'trigger-detection',
    category: 'trigger',
    labelKey: 'components.automation_nodes.trigger_detection',
    descriptionKey: 'components.automation_nodes.trigger_detection_desc',
    icon: FlashIcon,
    color: '#22c55e',
    defaults: {
      type: 'trigger-detection',
      cameraId: '',
      eventPhase: ['start'],
      detectionLabels: [],
      confidenceThreshold: 0,
      audioLabels: [],
      faceFilter: [],
      licensePlateFilter: [],
    },
  },
  {
    type: 'trigger-sensor',
    category: 'trigger',
    labelKey: 'components.automation_nodes.trigger_sensor',
    descriptionKey: 'components.automation_nodes.trigger_sensor_desc',
    icon: SensorIcon,
    color: '#22c55e',
    defaults: { type: 'trigger-sensor', cameraId: '', sensorType: '', sensorName: '', sensorPluginId: '', properties: [] },
  },
  {
    type: 'trigger-schedule',
    category: 'trigger',
    labelKey: 'components.automation_nodes.trigger_schedule',
    descriptionKey: 'components.automation_nodes.trigger_schedule_desc',
    icon: ClockIcon,
    color: '#22c55e',
    defaults: { type: 'trigger-schedule', cron: '0 * * * *' },
  },
  {
    type: 'trigger-webhook',
    category: 'trigger',
    labelKey: 'components.automation_nodes.trigger_webhook',
    descriptionKey: 'components.automation_nodes.trigger_webhook_desc',
    icon: WebhookIcon,
    color: '#22c55e',
    defaults: { type: 'trigger-webhook', webhookId: '' },
  },
  {
    type: 'trigger-mqtt',
    category: 'trigger',
    labelKey: 'components.automation_nodes.trigger_mqtt',
    descriptionKey: 'components.automation_nodes.trigger_mqtt_desc',
    icon: MqttIcon,
    color: '#22c55e',
    defaults: { type: 'trigger-mqtt', topic: '', payloadFilter: '' },
  },
  {
    type: 'trigger-system',
    category: 'trigger',
    labelKey: 'components.automation_nodes.trigger_system',
    descriptionKey: 'components.automation_nodes.trigger_system_desc',
    icon: CogIcon,
    color: '#22c55e',
    defaults: { type: 'trigger-system', category: 'system', eventType: '', targetId: '' },
  },
  {
    type: 'trigger-manual',
    category: 'trigger',
    labelKey: 'components.automation_nodes.trigger_manual',
    descriptionKey: 'components.automation_nodes.trigger_manual_desc',
    icon: HandIcon,
    color: '#22c55e',
    defaults: { type: 'trigger-manual' },
  },
  {
    type: 'trigger-geofence',
    category: 'trigger',
    labelKey: 'components.automation_nodes.trigger_geofence',
    descriptionKey: 'components.automation_nodes.trigger_geofence_desc',
    icon: MapPinIcon,
    color: '#22c55e',
    defaults: { type: 'trigger-geofence', geofenceId: '', zoneName: '', latitude: 0, longitude: 0, radius: 200, event: 'both', users: [] },
  },
  {
    type: 'condition-ifelse',
    category: 'condition',
    labelKey: 'components.automation_nodes.condition_ifelse',
    descriptionKey: 'components.automation_nodes.condition_ifelse_desc',
    icon: GitBranchIcon,
    color: '#f59e0b',
    defaults: { type: 'condition-ifelse', leftOperand: '', operator: '==', rightOperand: '' },
  },
  {
    type: 'condition-switch',
    category: 'condition',
    labelKey: 'components.automation_nodes.condition_switch',
    descriptionKey: 'components.automation_nodes.condition_switch_desc',
    icon: CodeBracesIcon,
    color: '#f59e0b',
    defaults: { type: 'condition-switch', variable: '', cases: [] },
  },
  {
    type: 'condition-sensorstate',
    category: 'condition',
    labelKey: 'components.automation_nodes.condition_sensorstate',
    descriptionKey: 'components.automation_nodes.condition_sensorstate_desc',
    icon: SensorIcon,
    color: '#f59e0b',
    defaults: { type: 'condition-sensorstate', cameraId: '', sensorType: '', sensorName: '', sensorPluginId: '', conditions: [], logic: 'AND' },
  },
  {
    type: 'condition-time',
    category: 'condition',
    labelKey: 'components.automation_nodes.condition_time',
    descriptionKey: 'components.automation_nodes.condition_time_desc',
    icon: TimeRangeIcon,
    color: '#f59e0b',
    defaults: { type: 'condition-time', startTime: '08:00', endTime: '18:00', days: [] },
  },
  {
    type: 'action-snapshot',
    category: 'action',
    labelKey: 'components.automation_nodes.action_snapshot',
    descriptionKey: 'components.automation_nodes.action_snapshot_desc',
    icon: CameraIcon,
    color: '#3b82f6',
    defaults: { type: 'action-snapshot', cameraId: '', forceNew: true },
    supportsRepeat: true,
  },
  {
    type: 'action-sensor',
    category: 'action',
    labelKey: 'components.automation_nodes.action_sensor',
    descriptionKey: 'components.automation_nodes.action_sensor_desc',
    icon: LightbulbIcon,
    color: '#3b82f6',
    defaults: { type: 'action-sensor', cameraId: '', sensorType: '', sensorName: '', sensorPluginId: '', properties: [] },
  },
  {
    type: 'action-notification',
    category: 'action',
    labelKey: 'components.automation_nodes.action_notification',
    descriptionKey: 'components.automation_nodes.action_notification_desc',
    icon: NotificationIcon,
    color: '#3b82f6',
    defaults: { type: 'action-notification', title: '', body: '', severity: 'info', deepLink: '', targets: [] },
  },
  {
    type: 'action-http',
    category: 'action',
    labelKey: 'components.automation_nodes.action_http',
    descriptionKey: 'components.automation_nodes.action_http_desc',
    icon: HttpIcon,
    color: '#3b82f6',
    defaults: { type: 'action-http', url: '', method: 'POST', headers: {}, body: '' },
    supportsRepeat: true,
  },
  {
    type: 'action-mqtt',
    category: 'action',
    labelKey: 'components.automation_nodes.action_mqtt',
    descriptionKey: 'components.automation_nodes.action_mqtt_desc',
    icon: MqttIcon,
    color: '#3b82f6',
    defaults: { type: 'action-mqtt', topic: '', payload: '', retain: false },
    supportsRepeat: true,
  },
  {
    type: 'action-delay',
    category: 'action',
    labelKey: 'components.automation_nodes.action_delay',
    descriptionKey: 'components.automation_nodes.action_delay_desc',
    icon: TimerIcon,
    color: '#3b82f6',
    defaults: { type: 'action-delay', duration: 5, unit: 'seconds' },
  },
  {
    type: 'action-variable',
    category: 'action',
    labelKey: 'components.automation_nodes.action_variable',
    descriptionKey: 'components.automation_nodes.action_variable_desc',
    icon: VariableIcon,
    color: '#3b82f6',
    defaults: { type: 'action-variable', variableName: '', operator: '=', value: '' },
  },
  {
    type: 'action-plugin',
    category: 'action',
    labelKey: 'components.automation_nodes.action_plugin',
    descriptionKey: 'components.automation_nodes.action_plugin_desc',
    icon: PluginIcon,
    color: '#3b82f6',
    defaults: { type: 'action-plugin', pluginName: '', pluginInterface: '', method: '', params: {}, config: {} },
    supportsRepeat: true,
  },
  {
    type: 'action-camera-control',
    category: 'action',
    labelKey: 'components.automation_nodes.action_camera_control',
    descriptionKey: 'components.automation_nodes.action_camera_control_desc',
    icon: CameraControlIcon,
    color: '#3b82f6',
    defaults: { type: 'action-camera-control', cameraId: '', properties: [] },
  },
  {
    type: 'action-image-input',
    category: 'utility',
    labelKey: 'components.automation_nodes.action_image_input',
    descriptionKey: 'components.automation_nodes.action_image_input_desc',
    icon: ImageIcon,
    color: '#8b5cf6',
    defaults: { type: 'action-image-input', source: '', variableName: 'image' },
  },
  {
    type: 'action-output',
    category: 'utility',
    labelKey: 'components.automation_nodes.action_output',
    descriptionKey: 'components.automation_nodes.action_output_desc',
    icon: OutputIcon,
    color: '#8b5cf6',
    defaults: { type: 'action-output', variables: [] },
  },
];

export function getNodeDefinition(type: string): NodeDefinition | undefined {
  return NODE_DEFINITIONS.find((d) => d.type === type);
}

export function getNodesByCategory(category: string): NodeDefinition[] {
  return NODE_DEFINITIONS.filter((d) => d.category === category);
}
