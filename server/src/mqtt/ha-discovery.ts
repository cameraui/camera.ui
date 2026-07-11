import { LightCapability, SensorType } from '@camera.ui/sdk';

import { ConfigService } from '../services/config/index.js';
import { sanitizeTopicSegment } from './topics.js';

import type { Camera } from '@camera.ui/sdk';
import type { StoredSensorData } from '../rpc/interfaces/sensor.js';
import type { MqttTopics } from './topics.js';

// Home Assistant MQTT discovery (https://www.home-assistant.io/integrations/mqtt/#mqtt-discovery):
// retained config messages under <haPrefix>/<component>/cameraui_<cameraId>/<objectId>/config.
// HA builds one device per camera from the shared `device` block. Deleting an
// entity = publishing an empty retained payload to its config topic.
//
// Sensor property topics carry JSON-encoded values, so payload/state matchers
// use the JSON literals ('true', '0', …). Numeric states (lock/garage/alarm)
// follow the HomeKit-style enums in @camera.ui/sdk.

export interface DiscoveryMessage {
  topic: string;
  payload: string;
}

export const OBJECT_DETECTION_LABELS = ['person', 'vehicle', 'animal', 'package'] as const;

const DETECTION_LABEL_ICONS: Record<string, string> = {
  person: 'mdi:account',
  vehicle: 'mdi:car',
  animal: 'mdi:paw',
  package: 'mdi:package-variant-closed',
};

export function buildCameraDiscovery(topics: MqttTopics, haPrefix: string, camera: Camera, hasObjectDetection: boolean): DiscoveryMessage[] {
  const cameraId = camera._id;
  const messages: DiscoveryMessage[] = [];

  messages.push({
    topic: configTopic(haPrefix, 'binary_sensor', cameraId, 'status'),
    payload: JSON.stringify({
      ...baseConfig(topics, camera, 'status', 'Status', { bridgeAvailabilityOnly: true }),
      device_class: 'connectivity',
      entity_category: 'diagnostic',
      state_topic: topics.cameraStatus(cameraId),
      payload_on: 'online',
      payload_off: 'offline',
    }),
  });

  messages.push({
    topic: configTopic(haPrefix, 'binary_sensor', cameraId, 'motion'),
    payload: JSON.stringify({
      ...baseConfig(topics, camera, 'motion', 'Motion'),
      device_class: 'motion',
      state_topic: topics.cameraMotion(cameraId),
      payload_on: 'ON',
      payload_off: 'OFF',
    }),
  });

  messages.push({
    topic: configTopic(haPrefix, 'camera', cameraId, 'snapshot'),
    payload: JSON.stringify({
      ...baseConfig(topics, camera, 'snapshot', 'Snapshot'),
      topic: topics.cameraSnapshot(cameraId),
    }),
  });

  if (hasObjectDetection) {
    for (const label of OBJECT_DETECTION_LABELS) {
      messages.push({
        topic: configTopic(haPrefix, 'binary_sensor', cameraId, `detection_${label}`),
        payload: JSON.stringify({
          ...baseConfig(topics, camera, `detection_${label}`, capitalize(label)),
          icon: DETECTION_LABEL_ICONS[label],
          state_topic: topics.cameraDetection(cameraId, label),
          payload_on: 'ON',
          payload_off: 'OFF',
        }),
      });
    }
  }

  return messages;
}

export function buildSensorDiscovery(topics: MqttTopics, haPrefix: string, camera: Camera, sensor: StoredSensorData): DiscoveryMessage[] {
  const cameraId = camera._id;
  const name = sensor.displayName || sensor.name;
  const objectId = sanitizeTopicSegment(sensor.stableId);

  const state = (property: string) => topics.sensorProperty(cameraId, sensor.stableId, property);
  const command = (property: string) => `${state(property)}/set`;
  const config = (component: string) => configTopic(haPrefix, component, cameraId, objectId);
  const base = () => baseConfig(topics, camera, objectId, name);

  const binarySensor = (property: string, deviceClass?: string, icon?: string): DiscoveryMessage => ({
    topic: config('binary_sensor'),
    payload: JSON.stringify({
      ...base(),
      ...(deviceClass ? { device_class: deviceClass } : {}),
      ...(icon ? { icon } : {}),
      state_topic: state(property),
      payload_on: 'true',
      payload_off: 'false',
    }),
  });

  switch (sensor.type) {
    case SensorType.Contact:
      return [binarySensor('detected', 'opening')];
    case SensorType.Occupancy:
      return [binarySensor('detected', 'occupancy')];
    case SensorType.Smoke:
      return [binarySensor('detected', 'smoke')];
    case SensorType.Leak:
      return [binarySensor('detected', 'moisture')];
    case SensorType.Doorbell:
      return [binarySensor('ring', undefined, 'mdi:doorbell')];

    case SensorType.Temperature:
      return [
        {
          topic: config('sensor'),
          payload: JSON.stringify({
            ...base(),
            device_class: 'temperature',
            unit_of_measurement: '°C',
            state_class: 'measurement',
            state_topic: state('current'),
          }),
        },
      ];
    case SensorType.Humidity:
      return [
        {
          topic: config('sensor'),
          payload: JSON.stringify({
            ...base(),
            device_class: 'humidity',
            unit_of_measurement: '%',
            state_class: 'measurement',
            state_topic: state('current'),
          }),
        },
      ];
    case SensorType.Battery:
      return [
        {
          topic: config('sensor'),
          payload: JSON.stringify({
            ...base(),
            device_class: 'battery',
            unit_of_measurement: '%',
            state_class: 'measurement',
            entity_category: 'diagnostic',
            state_topic: state('level'),
          }),
        },
      ];

    case SensorType.Switch:
      return [
        {
          topic: config('switch'),
          payload: JSON.stringify({
            ...base(),
            state_topic: state('on'),
            command_topic: command('on'),
            state_on: 'true',
            state_off: 'false',
            payload_on: 'true',
            payload_off: 'false',
          }),
        },
      ];
    case SensorType.Light: {
      const hasBrightness = sensor.capabilities.includes(LightCapability.Brightness);
      return [
        {
          topic: config('light'),
          payload: JSON.stringify({
            ...base(),
            state_topic: state('on'),
            command_topic: command('on'),
            state_value_template: '{{ value }}',
            payload_on: 'true',
            payload_off: 'false',
            ...(hasBrightness
              ? {
                  brightness_state_topic: state('brightness'),
                  brightness_command_topic: command('brightness'),
                  brightness_scale: 100,
                }
              : {}),
          }),
        },
      ];
    }
    case SensorType.Siren:
      return [
        {
          topic: config('siren'),
          payload: JSON.stringify({
            ...base(),
            state_topic: state('active'),
            command_topic: command('active'),
            state_on: 'true',
            state_off: 'false',
            payload_on: 'true',
            payload_off: 'false',
          }),
        },
      ];

    case SensorType.Lock:
      return [
        {
          topic: config('lock'),
          payload: JSON.stringify({
            ...base(),
            state_topic: state('currentState'),
            state_locked: '0',
            state_unlocked: '1',
            command_topic: command('targetState'),
            payload_lock: '0',
            payload_unlock: '1',
          }),
        },
      ];
    case SensorType.Garage:
      return [
        {
          topic: config('cover'),
          payload: JSON.stringify({
            ...base(),
            device_class: 'garage',
            state_topic: state('currentState'),
            state_open: '0',
            state_closed: '1',
            state_opening: '2',
            state_closing: '3',
            state_stopped: '4',
            command_topic: command('targetState'),
            payload_open: '0',
            payload_close: '1',
            payload_stop: null,
          }),
        },
      ];
    case SensorType.SecuritySystem:
      return [
        {
          topic: config('alarm_control_panel'),
          payload: JSON.stringify({
            ...base(),
            state_topic: state('currentState'),
            value_template: "{% set states = {0: 'armed_home', 1: 'armed_away', 2: 'armed_night', 3: 'disarmed', 4: 'triggered'} %}{{ states[value | int] }}",
            command_topic: command('targetState'),
            command_template: "{% set states = {'ARM_HOME': 0, 'ARM_AWAY': 1, 'ARM_NIGHT': 2, 'DISARM': 3} %}{{ states[action] }}",
            supported_features: ['arm_home', 'arm_away', 'arm_night'],
            code_arm_required: false,
            code_disarm_required: false,
          }),
        },
      ];

    default:
      return [];
  }
}

function configTopic(haPrefix: string, component: string, cameraId: string, objectId: string): string {
  return `${haPrefix}/${component}/cameraui_${sanitizeTopicSegment(cameraId)}/${objectId}/config`;
}

function baseConfig(topics: MqttTopics, camera: Camera, objectId: string, name: string, opts: { bridgeAvailabilityOnly?: boolean } = {}): Record<string, unknown> {
  const availability = [{ topic: topics.availability }];
  if (!opts.bridgeAvailabilityOnly) {
    availability.push({ topic: topics.cameraStatus(camera._id) });
  }

  return {
    name,
    unique_id: `cameraui_${camera._id}_${objectId}`,
    availability,
    availability_mode: 'all',
    device: {
      identifiers: [`cameraui_${camera._id}`],
      name: camera.name,
      manufacturer: camera.info?.manufacturer ?? 'camera.ui',
      ...(camera.info?.model ? { model: camera.info.model } : {}),
      ...(camera.info?.firmwareVersion ? { sw_version: camera.info.firmwareVersion } : {}),
    },
    origin: {
      name: 'camera.ui',
      sw_version: ConfigService.VERSION,
    },
  };
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
