import { OBJECT_DETECTION_LABELS, SensorDomain } from '@camera.ui/sdk';

import { resolveSensorSemantics } from '../camera/sensors/semantics.js';
import { ConfigService } from '../services/config/index.js';
import { sanitizeTopicSegment } from './topics.js';

import type { Camera, SensorSemantics } from '@camera.ui/sdk';
import type { StoredSensorData } from '../rpc/interfaces/sensor.js';
import type { MqttTopics } from './topics.js';

// Home Assistant MQTT discovery (https://www.home-assistant.io/integrations/mqtt/#mqtt-discovery):

export interface DiscoveryMessage {
  topic: string;
  payload: string;
}

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
      ...baseConfig(topics, camera, `${cameraId}_status`, 'Status', { bridgeAvailabilityOnly: true }),
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
      ...baseConfig(topics, camera, `${cameraId}_motion`, 'Motion'),
      device_class: 'motion',
      state_topic: topics.cameraMotion(cameraId),
      payload_on: 'ON',
      payload_off: 'OFF',
    }),
  });

  messages.push({
    topic: configTopic(haPrefix, 'camera', cameraId, 'snapshot'),
    payload: JSON.stringify({
      ...baseConfig(topics, camera, `${cameraId}_snapshot`, 'Snapshot'),
      topic: topics.cameraSnapshot(cameraId),
    }),
  });

  if (hasObjectDetection) {
    for (const label of OBJECT_DETECTION_LABELS) {
      messages.push({
        topic: configTopic(haPrefix, 'binary_sensor', cameraId, `detection_${label}`),
        payload: JSON.stringify({
          ...baseConfig(topics, camera, `${cameraId}_detection_${label}`, capitalize(label)),
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

// HA sends these actions on the alarm command topic; map them onto our states
const ALARM_ACTIONS: Record<string, string> = {
  ARM_HOME: 'armed_home',
  ARM_AWAY: 'armed_away',
  ARM_NIGHT: 'armed_night',
  DISARM: 'disarmed',
};

const DOMAIN_COMPONENT: Record<SensorDomain, string> = {
  [SensorDomain.Binary]: 'binary_sensor',
  [SensorDomain.Measurement]: 'sensor',
  [SensorDomain.Switch]: 'switch',
  [SensorDomain.Light]: 'light',
  [SensorDomain.Siren]: 'siren',
  [SensorDomain.Lock]: 'lock',
  [SensorDomain.Cover]: 'cover',
  [SensorDomain.Alarm]: 'alarm_control_panel',
};

export function buildSensorDiscovery(topics: MqttTopics, haPrefix: string, camera: Camera, sensor: StoredSensorData): DiscoveryMessage[] {
  const semantics = resolveSensorSemantics(sensor);
  if (!semantics) return [];

  const cameraId = camera._id;
  const objectId = sanitizeTopicSegment(sensor.stableId);

  const state = (property: string) => topics.sensorProperty(cameraId, sensor.stableId, property);
  const command = (property: string) => `${state(property)}/set`;

  const config = {
    ...baseConfig(topics, camera, sensor.globalId, sensor.displayName || sensor.name),
    ...(semantics.deviceClass ? { device_class: semantics.deviceClass } : {}),
    ...(semantics.icon ? { icon: semantics.icon } : {}),
    ...(semantics.diagnostic ? { entity_category: 'diagnostic' } : {}),
    state_topic: state(semantics.stateProperty),
    ...domainConfig(semantics, state, command),
  };

  return [{ topic: configTopic(haPrefix, DOMAIN_COMPONENT[semantics.domain], cameraId, objectId), payload: JSON.stringify(config) }];
}

function domainConfig(semantics: SensorSemantics, state: (property: string) => string, command: (property: string) => string): Record<string, unknown> {
  const commandTopic = command(semantics.commandProperty);
  const states = semantics.states ?? {};

  switch (semantics.domain) {
    case SensorDomain.Binary:
      return { payload_on: 'true', payload_off: 'false' };

    case SensorDomain.Measurement:
      return { unit_of_measurement: semantics.unit, state_class: 'measurement' };

    case SensorDomain.Switch:
    case SensorDomain.Siren:
      return { command_topic: commandTopic, state_on: 'true', state_off: 'false', payload_on: 'true', payload_off: 'false' };

    case SensorDomain.Light:
      return {
        command_topic: commandTopic,
        state_value_template: '{{ value }}',
        payload_on: 'true',
        payload_off: 'false',
        ...(semantics.brightness
          ? {
              brightness_state_topic: state(semantics.brightness.property),
              brightness_command_topic: command(semantics.brightness.property),
              brightness_scale: semantics.brightness.scale,
            }
          : {}),
      };

    case SensorDomain.Lock:
      return {
        command_topic: commandTopic,
        state_locked: String(states.locked),
        state_unlocked: String(states.unlocked),
        payload_lock: String(states.locked),
        payload_unlock: String(states.unlocked),
      };

    case SensorDomain.Cover:
      return {
        command_topic: commandTopic,
        state_open: String(states.open),
        state_closed: String(states.closed),
        state_opening: String(states.opening),
        state_closing: String(states.closing),
        state_stopped: String(states.stopped),
        payload_open: String(states.open),
        payload_close: String(states.closed),
        payload_stop: null,
      };

    case SensorDomain.Alarm:
      return {
        command_topic: commandTopic,
        value_template: `{% set states = {${Object.entries(states)
          .map(([name, value]) => `${value}: '${name}'`)
          .join(', ')}} %}{{ states[value | int] }}`,
        command_template: `{% set states = {${Object.entries(ALARM_ACTIONS)
          .map(([action, name]) => `'${action}': ${states[name]}`)
          .join(', ')}} %}{{ states[action] }}`,
        supported_features: ['arm_home', 'arm_away', 'arm_night'],
        code_arm_required: false,
        code_disarm_required: false,
      };
  }
}

function configTopic(haPrefix: string, component: string, cameraId: string, objectId: string): string {
  return `${haPrefix}/${component}/cameraui_${sanitizeTopicSegment(cameraId)}/${objectId}/config`;
}

function baseConfig(topics: MqttTopics, camera: Camera, uid: string, name: string, opts: { bridgeAvailabilityOnly?: boolean } = {}): Record<string, unknown> {
  const availability = [{ topic: topics.availability }];
  if (!opts.bridgeAvailabilityOnly) {
    availability.push({ topic: topics.cameraStatus(camera._id) });
  }

  return {
    name,
    unique_id: `cameraui_${uid}`,
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
