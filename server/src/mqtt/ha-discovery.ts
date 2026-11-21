import { LightColorMode, OBJECT_DETECTION_LABELS, SensorDomain } from '@camera.ui/sdk';

import { resolveSensorSemantics } from '../sensors/semantics.js';
import { getSensorPropertySpec } from '../sensors/types.js';
import { ConfigService } from '../services/config/index.js';
import { sanitizeTopicSegment } from './topics.js';

import type { Camera, SensorPropertySpec, SensorSemantics } from '@camera.ui/sdk';
import type { StoredSensorData } from '../rpc/interfaces/sensor.js';
import type { MqttTopics } from './topics.js';

export interface DiscoveryMessage {
  topic: string;
  payload: string;
}

const DETECTION_LABEL_ICONS: Record<string, string> = {
  person: 'mdi:account',
  vehicle: 'mdi:car',
  animal: 'mdi:paw',
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
  [SensorDomain.Event]: 'event',
  [SensorDomain.Text]: 'text',
};

export function buildSensorDiscovery(topics: MqttTopics, haPrefix: string, sensor: StoredSensorData, viaCamera?: Camera): DiscoveryMessage[] {
  const semantics = resolveSensorSemantics(sensor);
  if (!semantics) return [];

  const state = (property: string) => topics.sensorProperty(sensor.id, property);
  const command = (property: string) => `${state(property)}/set`;

  const displayName = sensor.displayName || sensor.name;
  // null names the main sensor after its device
  const entityName = sensor.device ? (sensor.primary ? null : sensor.shortName) : displayName;
  const shared = {
    availability: [{ topic: topics.availability }],
    availability_mode: 'all',
    device: sensor.device
      ? {
          identifiers: [haDeviceIdentifier(sensor)],
          name: sensor.device.name,
          manufacturer: sensor.device.manufacturer ?? 'camera.ui',
          ...(sensor.device.model ? { model: sensor.device.model } : {}),
          ...(sensor.device.firmware ? { sw_version: sensor.device.firmware } : {}),
          ...(sensor.device.serialNumber ? { serial_number: sensor.device.serialNumber } : {}),
        }
      : {
          identifiers: [haDeviceIdentifier(sensor)],
          name: displayName,
          manufacturer: 'camera.ui',
          ...(viaCamera ? { via_device: `cameraui_${viaCamera._id}` } : {}),
        },
    origin: {
      name: 'camera.ui',
      sw_version: ConfigService.VERSION,
    },
  };

  const config = {
    name: entityName,
    unique_id: `cameraui_sensor_${sensor.id}`,
    ...shared,
    ...(semantics.deviceClass ? { device_class: semantics.deviceClass } : {}),
    ...(semantics.icon ? { icon: semantics.icon } : {}),
    ...(semantics.diagnostic ? { entity_category: 'diagnostic' } : {}),
    state_topic: state(semantics.stateProperty),
    ...domainConfig(semantics, (property) => sensor.propertySpecs[property] ?? getSensorPropertySpec(sensor.type, property), state, command),
  };

  const messages = [{ topic: configTopic(haPrefix, DOMAIN_COMPONENT[semantics.domain], `sensor_${sensor.id}`, 'state'), payload: JSON.stringify(config) }];

  // HA's siren carries volume in the on/off payload, so volume ships as its own number entity
  if (semantics.volume) {
    messages.push({
      topic: configTopic(haPrefix, 'number', `sensor_${sensor.id}`, 'volume'),
      payload: JSON.stringify({
        name: entityName ? `${entityName} Volume` : 'Volume',
        unique_id: `cameraui_sensor_${sensor.id}_volume`,
        ...shared,
        icon: 'mdi:volume-high',
        state_topic: state(semantics.volume.property),
        command_topic: command(semantics.volume.property),
        min: 0,
        max: semantics.volume.scale,
        step: 1,
        unit_of_measurement: '%',
        mode: 'slider',
      }),
    });
  }

  for (const reading of semantics.readings ?? []) {
    // without a name HA names the entity after its device class
    messages.push({
      topic: configTopic(haPrefix, 'sensor', `sensor_${sensor.id}`, reading.property),
      payload: JSON.stringify({
        unique_id: `cameraui_sensor_${sensor.id}_${reading.property}`,
        ...shared,
        ...(reading.deviceClass ? { device_class: reading.deviceClass } : {}),
        ...(reading.unit ? { unit_of_measurement: reading.unit } : {}),
        state_topic: state(reading.property),
        state_class: 'measurement',
      }),
    });
  }

  for (const property of semantics.choices ?? []) {
    const choices = sensor.propertySpecs[property]?.choices ?? [];
    const values = Object.fromEntries(choices.map((choice) => [choice.value, choice.label]));
    const labels = Object.fromEntries(choices.map((choice) => [choice.label, choice.value]));
    messages.push({
      topic: configTopic(haPrefix, 'select', `sensor_${sensor.id}`, property),
      payload: JSON.stringify({
        name: entityName ? `${entityName} ${capitalize(property)}` : capitalize(property),
        unique_id: `cameraui_sensor_${sensor.id}_${property}`,
        ...shared,
        state_topic: state(property),
        value_template: `{% set labels = ${JSON.stringify(values)} %}{{ labels[value_json] | default('') }}`,
        command_topic: command(property),
        command_template: `{% set values = ${JSON.stringify(labels)} %}{{ values[value] | tojson }}`,
        options: choices.map((choice) => choice.label),
      }),
    });
  }

  return messages;
}

export function haDeviceIdentifier(sensor: StoredSensorData): string {
  return sensor.device ? `cameraui_device_${sensor.device.id}` : `cameraui_sensor_${sensor.id}`;
}

function domainConfig(
  semantics: SensorSemantics,
  spec: (property: string) => SensorPropertySpec | undefined,
  state: (property: string) => string,
  command: (property: string) => string,
): Record<string, unknown> {
  const commandTopic = command(semantics.commandProperty);
  const states = semantics.states ?? {};

  switch (semantics.domain) {
    case SensorDomain.Binary:
      return { payload_on: 'true', payload_off: 'false' };

    case SensorDomain.Measurement:
      // a level reading names its states, HA wants them listed and no unit
      if (semantics.deviceClass === 'enum') return { value_template: '{{ value_json }}', options: Object.values(states).map(String) };
      return { unit_of_measurement: semantics.unit, state_class: 'measurement' };

    case SensorDomain.Switch:
      return { command_topic: commandTopic, state_on: 'true', state_off: 'false', payload_on: 'true', payload_off: 'false' };

    case SensorDomain.Siren:
      return {
        command_topic: commandTopic,
        state_on: 'true',
        state_off: 'false',
        payload_on: 'true',
        payload_off: 'false',
        support_duration: false,
        support_volume_set: false,
      };

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
        ...lightColorConfig(semantics.color, spec, state, command),
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

    case SensorDomain.Alarm: {
      const offered = spec(semantics.commandProperty)?.values;
      return {
        command_topic: commandTopic,
        value_template: `{% set states = {${Object.entries(states)
          .map(([name, value]) => `${value}: '${name}'`)
          .join(', ')}} %}{{ states[value | int] }}`,
        command_template: `{% set states = {${Object.entries(ALARM_ACTIONS)
          .map(([action, name]) => `'${action}': ${states[name]}`)
          .join(', ')}} %}{{ states[action] }}`,
        supported_features: Object.entries(ALARM_ACTIONS)
          .filter(([action, name]) => action !== 'DISARM' && (!offered || Object.values(offered).includes(states[name])))
          .map(([action]) => action.toLowerCase()),
        code_arm_required: false,
        code_disarm_required: false,
      };
    }

    case SensorDomain.Event:
      // the property is empty between two events, HA ignores an empty render
      return {
        event_types: Object.values(states).map(String),
        value_template: "{% if value_json %}{{ {'event_type': value_json} | tojson }}{% endif %}",
      };

    case SensorDomain.Text: {
      const maxLength = spec(semantics.commandProperty)?.maxLength;
      return {
        command_topic: commandTopic,
        value_template: '{{ value_json }}',
        command_template: '{{ value | tojson }}',
        mode: 'text',
        ...(maxLength ? { max: maxLength } : {}),
      };
    }
  }
}

function lightColorConfig(
  color: SensorSemantics['color'],
  spec: (property: string) => SensorPropertySpec | undefined,
  state: (property: string) => string,
  command: (property: string) => string,
): Record<string, unknown> {
  const temperature = color?.temperature;
  const hueSaturation = color?.hueSaturation;
  return {
    ...(temperature
      ? {
          color_temp_kelvin: true,
          color_temp_state_topic: state(temperature),
          color_temp_command_topic: command(temperature),
          min_kelvin: spec(temperature)?.min,
          max_kelvin: spec(temperature)?.max,
        }
      : {}),
    ...(hueSaturation
      ? {
          hs_state_topic: state(hueSaturation),
          hs_value_template: '{{ value_json.hue }},{{ value_json.saturation }}',
          hs_command_topic: command(hueSaturation),
          hs_command_template: "{{ {'hue': hue, 'saturation': sat} | tojson }}",
        }
      : {}),
    ...(color?.mode
      ? {
          color_mode_state_topic: state(color.mode),
          color_mode_value_template: `{{ 'color_temp' if value_json == '${LightColorMode.Temperature}' else 'hs' }}`,
        }
      : {}),
  };
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
