import { LightColorMode, OBJECT_DETECTION_LABELS, SensorDomain } from '@camera.ui/sdk';

import { resolveSensorSemantics } from '../sensors/semantics.js';
import { getSensorPropertySpec } from '../sensors/types.js';
import { ConfigService } from '../services/config/index.js';
import { sanitizeTopicSegment } from './topics.js';

import type { Camera, SensorClimate, SensorPropertyChoice, SensorPropertySpec, SensorSemantics } from '@camera.ui/sdk';
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
    topic: configTopic(haPrefix, 'switch', cameraId, 'privacy'),
    payload: JSON.stringify({
      ...baseConfig(topics, camera, `${cameraId}_privacy`, 'Privacy mode', { bridgeAvailabilityOnly: true }),
      icon: 'mdi:eye-off',
      state_topic: topics.cameraPrivacy(cameraId),
      command_topic: topics.cameraPrivacyCommand(cameraId),
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

export const COVER_STOP_PAYLOAD = 'STOP';

const VACUUM_COMMANDS: Record<string, { feature: string; payload: string }> = {
  start: { feature: 'start', payload: 'payload_start' },
  pause: { feature: 'pause', payload: 'payload_pause' },
  stop: { feature: 'stop', payload: 'payload_stop' },
  dock: { feature: 'return_home', payload: 'payload_return_to_base' },
  locate: { feature: 'locate', payload: 'payload_locate' },
  spot: { feature: 'clean_spot', payload: 'payload_clean_spot' },
};

const LAWN_MOWER_OPTIONS: Record<string, string> = { start: 'start_mowing', pause: 'pause', dock: 'dock' };

const LOCK_STATES = ['locked', 'unlocked', 'locking', 'unlocking', 'jammed'];

const DOMAIN_COMPONENT: Record<SensorDomain, string | undefined> = {
  [SensorDomain.Binary]: 'binary_sensor',
  [SensorDomain.Measurement]: 'sensor',
  [SensorDomain.Switch]: 'switch',
  [SensorDomain.Light]: 'light',
  [SensorDomain.Siren]: 'siren',
  [SensorDomain.Lock]: 'lock',
  [SensorDomain.Cover]: 'cover',
  [SensorDomain.Climate]: 'climate',
  [SensorDomain.Fan]: 'fan',
  [SensorDomain.Valve]: 'valve',
  [SensorDomain.Scene]: 'scene',
  [SensorDomain.Humidifier]: 'humidifier',
  [SensorDomain.AirPurifier]: 'fan',
  [SensorDomain.WaterHeater]: 'water_heater',
  [SensorDomain.Vacuum]: 'vacuum',
  [SensorDomain.LawnMower]: 'lawn_mower',
  // HA's MQTT integration has no media player
  [SensorDomain.MediaPlayer]: undefined,
  [SensorDomain.Alarm]: 'alarm_control_panel',
  [SensorDomain.Event]: 'event',
  [SensorDomain.Text]: 'text',
};

export function buildSensorDiscovery(topics: MqttTopics, haPrefix: string, sensor: StoredSensorData, viaCamera?: Camera, room?: string): DiscoveryMessage[] {
  const semantics = resolveSensorSemantics(sensor);
  const component = semantics && DOMAIN_COMPONENT[semantics.domain];
  if (!component) return [];

  const state = (property: string) => topics.sensorProperty(sensor.id, property);
  const command = (property: string) => `${state(property)}/set`;

  const displayName = sensor.displayName || sensor.name;
  // null names the main sensor after its device
  const entityName = sensor.device ? (sensor.primary ? null : sensor.shortName) : displayName;
  const shared = {
    availability: [{ topic: topics.availability }, { topic: topics.sensorAvailability(sensor.id) }],
    availability_mode: 'all',
    device: sensor.device
      ? {
          identifiers: [haDeviceIdentifier(sensor)],
          name: sensor.device.name,
          manufacturer: sensor.device.manufacturer ?? 'camera.ui',
          ...(sensor.device.model ? { model: sensor.device.model } : {}),
          ...(sensor.device.firmware ? { sw_version: sensor.device.firmware } : {}),
          ...(sensor.device.serialNumber ? { serial_number: sensor.device.serialNumber } : {}),
          ...suggestedArea(room),
        }
      : {
          identifiers: [haDeviceIdentifier(sensor)],
          name: displayName,
          manufacturer: 'camera.ui',
          ...(viaCamera ? { via_device: `cameraui_${viaCamera._id}` } : {}),
          ...suggestedArea(room),
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
    state_topic: stateTopic(topics, sensor.id, semantics),
    ...domainConfig(semantics, (property) => sensor.propertySpecs[property] ?? getSensorPropertySpec(sensor.type, property), state, command),
  };

  const messages = [{ topic: configTopic(haPrefix, component, `sensor_${sensor.id}`, 'state'), payload: JSON.stringify(config) }];
  const category = (property: string) => (semantics.configuration?.includes(property) ? { entity_category: 'config' } : {});

  // HA's siren carries volume in the on/off payload, so volume ships as its own number entity
  if (semantics.volume) {
    messages.push({
      topic: configTopic(haPrefix, 'number', `sensor_${sensor.id}`, 'volume'),
      payload: JSON.stringify({
        name: entityName ? `${entityName} Volume` : 'Volume',
        unique_id: `cameraui_sensor_${sensor.id}_volume`,
        ...shared,
        ...category(semantics.volume.property),
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
        ...(reading.deviceClass ? { device_class: reading.deviceClass } : { name: settingName(entityName, reading.property) }),
        ...(reading.unit ? { unit_of_measurement: reading.unit } : {}),
        state_topic: state(reading.property),
        state_class: 'measurement',
      }),
    });
  }

  for (const indicator of semantics.indicators ?? []) {
    // named after the property, HA's name for a problem sensor says too little
    messages.push({
      topic: configTopic(haPrefix, 'binary_sensor', `sensor_${sensor.id}`, indicator.property),
      payload: JSON.stringify({
        name: settingName(entityName, indicator.property),
        unique_id: `cameraui_sensor_${sensor.id}_${indicator.property}`,
        ...shared,
        ...(indicator.deviceClass ? { device_class: indicator.deviceClass } : {}),
        state_topic: state(indicator.property),
        payload_on: 'true',
        payload_off: 'false',
      }),
    });
  }

  for (const property of semantics.choices ?? []) {
    const choices = sensor.propertySpecs[property]?.choices ?? [];
    messages.push({
      topic: configTopic(haPrefix, 'select', `sensor_${sensor.id}`, property),
      payload: JSON.stringify({
        name: settingName(entityName, property),
        unique_id: `cameraui_sensor_${sensor.id}_${property}`,
        ...shared,
        ...category(property),
        state_topic: state(property),
        value_template: choiceLabelTemplate(choices, ''),
        command_topic: command(property),
        command_template: choiceValueTemplate(choices),
        options: choices.map((choice) => choice.label),
      }),
    });
  }

  for (const property of semantics.toggles ?? []) {
    messages.push({
      topic: configTopic(haPrefix, 'switch', `sensor_${sensor.id}`, property),
      payload: JSON.stringify({
        name: settingName(entityName, property),
        unique_id: `cameraui_sensor_${sensor.id}_${property}`,
        ...shared,
        ...category(property),
        state_topic: state(property),
        command_topic: command(property),
        state_on: 'true',
        state_off: 'false',
        payload_on: 'true',
        payload_off: 'false',
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
        payload_lock: String(states.locked),
        payload_unlock: String(states.unlocked),
        ...Object.fromEntries(LOCK_STATES.map((name) => [`state_${name}`, name])),
        payload_reset: 'unknown',
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
        payload_stop: semantics.stop ? COVER_STOP_PAYLOAD : null,
        ...(semantics.position
          ? {
              position_topic: state(semantics.position.current),
              set_position_topic: command(semantics.position.target),
              position_open: 100,
              position_closed: 0,
            }
          : {}),
        ...(semantics.tilt
          ? {
              tilt_status_topic: state(semantics.tilt.current),
              tilt_command_topic: command(semantics.tilt.target),
              tilt_min: 0,
              tilt_max: 100,
            }
          : {}),
      };

    case SensorDomain.Climate:
      return climateConfig(semantics, spec, state, command);

    case SensorDomain.Fan:
      return fanConfig(semantics, commandTopic, state, command);

    case SensorDomain.Valve:
      return {
        // HA knows water and gas valves only
        ...(semantics.deviceClass ? { device_class: semantics.deviceClass === 'gas' ? 'gas' : 'water' } : {}),
        // with a position HA reads and sends the position on the state and command topics
        ...(semantics.position
          ? { state_topic: state(semantics.position.current), command_topic: command(semantics.position.target), reports_position: true }
          : {
              command_topic: commandTopic,
              state_open: String(states.open),
              state_closed: String(states.closed),
              state_opening: String(states.opening),
              state_closing: String(states.closing),
              payload_open: String(states.open),
              payload_close: String(states.closed),
            }),
      };

    case SensorDomain.Scene:
      return { state_topic: undefined, command_topic: commandTopic, payload_on: 'true' };

    case SensorDomain.Humidifier:
      return humidifierConfig(semantics, spec, commandTopic, state, command);

    case SensorDomain.AirPurifier:
      return fanConfig(semantics, commandTopic, state, command);

    case SensorDomain.WaterHeater:
      return semantics.climate ? temperatureControlConfig(semantics, semantics.climate, spec, state, command) : {};

    case SensorDomain.Vacuum:
      return vacuumConfig(semantics, spec, commandTopic, command);

    case SensorDomain.LawnMower:
      return {
        state_topic: undefined,
        activity_state_topic: state(semantics.stateProperty),
        activity_value_template: '{{ value_json }}',
        // HA sends the option's name unless a template names the command
        ...Object.fromEntries(
          Object.entries(semantics.commands ?? {}).flatMap(([name, value]) => {
            const option = LAWN_MOWER_OPTIONS[name];
            return option
              ? [
                  [`${option}_command_topic`, commandTopic],
                  [`${option}_command_template`, value],
                ]
              : [];
          }),
        ),
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
    case SensorDomain.MediaPlayer:
      return {};
  }
}

export function vacuumStatePayload(sensor: StoredSensorData): string | undefined {
  const semantics = resolveSensorSemantics(sensor);
  if (semantics?.domain !== SensorDomain.Vacuum) return undefined;
  const fanSpeed = semantics.fanSpeed ? { fan_speed: sensor.properties[semantics.fanSpeed.property] ?? null } : {};
  return JSON.stringify({ state: sensor.properties[semantics.stateProperty] ?? null, ...fanSpeed });
}

export function lockStatePayload(sensor: StoredSensorData): string | undefined {
  const semantics = resolveSensorSemantics(sensor);
  if (semantics?.domain !== SensorDomain.Lock) return undefined;
  const { locked, unlocked, jammed } = semantics.states ?? {};
  const current = sensor.properties[semantics.stateProperty];
  const target = sensor.properties[semantics.commandProperty];
  // a lock with a target other than its state is on its way there, as in HomeKit
  if (current === locked) return target === unlocked ? 'unlocking' : 'locked';
  if (current === unlocked) return target === locked ? 'locking' : 'unlocked';
  return jammed !== undefined && current === jammed ? 'jammed' : 'unknown';
}

function stateTopic(topics: MqttTopics, sensorId: string, semantics: SensorSemantics): string {
  // HA reads these from one topic, the bridge publishes it from several properties
  if (semantics.domain === SensorDomain.Vacuum) return topics.sensorVacuumState(sensorId);
  if (semantics.domain === SensorDomain.Lock) return topics.sensorLockState(sensorId);
  return topics.sensorProperty(sensorId, semantics.stateProperty);
}

function vacuumConfig(
  semantics: SensorSemantics,
  spec: (property: string) => SensorPropertySpec | undefined,
  commandTopic: string,
  command: (property: string) => string,
): Record<string, unknown> {
  const commands = Object.entries(semantics.commands ?? {}).flatMap(([name, value]) => (VACUUM_COMMANDS[name] ? [{ ...VACUUM_COMMANDS[name], value }] : []));
  // HA sends the fan speed back as it is in the list, so the list holds the choice values
  const fanSpeeds = semantics.fanSpeed ? (spec(semantics.fanSpeed.property)?.choices ?? []).map((choice) => String(choice.value)) : [];
  return {
    command_topic: commandTopic,
    ...Object.fromEntries(commands.map(({ payload, value }) => [payload, value])),
    supported_features: [...commands.map(({ feature }) => feature), ...(fanSpeeds.length ? ['fan_speed'] : [])],
    ...(semantics.fanSpeed && fanSpeeds.length ? { set_fan_speed_topic: command(semantics.fanSpeed.property), fan_speed_list: fanSpeeds } : {}),
  };
}

function climateConfig(
  semantics: SensorSemantics,
  spec: (property: string) => SensorPropertySpec | undefined,
  state: (property: string) => string,
  command: (property: string) => string,
): Record<string, unknown> {
  const climate = semantics.climate;
  if (!climate) return {};
  const target = spec(climate.target);
  const json = '{{ value_json }}';
  return {
    ...temperatureControlConfig(semantics, climate, spec, state, command),
    ...(target?.step !== undefined ? { temp_step: target.step } : {}),
    ...(climate.targetLow && climate.targetHigh
      ? {
          temperature_low_state_topic: state(climate.targetLow),
          temperature_low_command_topic: command(climate.targetLow),
          temperature_high_state_topic: state(climate.targetHigh),
          temperature_high_command_topic: command(climate.targetHigh),
        }
      : {}),
    ...(climate.action ? { action_topic: state(climate.action), action_template: json } : {}),
    ...(climate.humidity ? { current_humidity_topic: state(climate.humidity), current_humidity_template: json } : {}),
    ...(climate.targetHumidity
      ? {
          target_humidity_state_topic: state(climate.targetHumidity),
          target_humidity_command_topic: command(climate.targetHumidity),
          min_humidity: spec(climate.targetHumidity)?.min ?? 0,
          max_humidity: spec(climate.targetHumidity)?.max ?? 100,
        }
      : {}),
  };
}

function temperatureControlConfig(
  semantics: SensorSemantics,
  climate: SensorClimate,
  spec: (property: string) => SensorPropertySpec | undefined,
  state: (property: string) => string,
  command: (property: string) => string,
): Record<string, unknown> {
  const target = spec(climate.target);
  // strings and null arrive as JSON, HA reads the rendered "None" as unknown
  const json = '{{ value_json }}';
  return {
    temperature_unit: 'C',
    precision: 0.1,
    modes: Object.values(semantics.states ?? {}).map(String),
    mode_state_topic: state(climate.mode),
    mode_state_template: json,
    mode_command_topic: command(climate.mode),
    current_temperature_topic: state(climate.current),
    current_temperature_template: json,
    temperature_state_topic: state(climate.target),
    temperature_command_topic: command(climate.target),
    ...(target?.min !== undefined ? { min_temp: target.min } : {}),
    ...(target?.max !== undefined ? { max_temp: target.max } : {}),
  };
}

function humidifierConfig(
  semantics: SensorSemantics,
  spec: (property: string) => SensorPropertySpec | undefined,
  commandTopic: string,
  state: (property: string) => string,
  command: (property: string) => string,
): Record<string, unknown> {
  const humidifier = semantics.humidifier;
  if (!humidifier) return {};
  const target = spec(humidifier.target);
  const modes = humidifier.mode ? (spec(humidifier.mode)?.choices ?? []) : [];
  const json = '{{ value_json }}';
  return {
    command_topic: commandTopic,
    payload_on: 'true',
    payload_off: 'false',
    target_humidity_state_topic: state(humidifier.target),
    target_humidity_command_topic: command(humidifier.target),
    min_humidity: target?.min ?? 0,
    max_humidity: target?.max ?? 100,
    ...(humidifier.current ? { current_humidity_topic: state(humidifier.current), current_humidity_template: json } : {}),
    ...(humidifier.action ? { action_topic: state(humidifier.action), action_template: json } : {}),
    ...(humidifier.mode && modes.length
      ? {
          modes: modes.map((choice) => choice.label),
          mode_state_topic: state(humidifier.mode),
          // HA resets the mode on "None"
          mode_state_template: choiceLabelTemplate(modes, 'None'),
          mode_command_topic: command(humidifier.mode),
          mode_command_template: choiceValueTemplate(modes),
        }
      : {}),
  };
}

function choiceLabelTemplate(choices: readonly SensorPropertyChoice[], fallback: string): string {
  const labels = Object.fromEntries(choices.map((choice) => [choice.value, choice.label]));
  return `{% set labels = ${JSON.stringify(labels)} %}{{ labels[value_json] | default('${fallback}') }}`;
}

function choiceValueTemplate(choices: readonly SensorPropertyChoice[]): string {
  const values = Object.fromEntries(choices.map((choice) => [choice.label, choice.value]));
  return `{% set values = ${JSON.stringify(values)} %}{{ values[value] | tojson }}`;
}

function fanConfig(
  semantics: SensorSemantics,
  commandTopic: string,
  state: (property: string) => string,
  command: (property: string) => string,
): Record<string, unknown> {
  const { speed, direction, oscillating } = semantics.fan ?? {};
  return {
    command_topic: commandTopic,
    payload_on: 'true',
    payload_off: 'false',
    ...(speed ? { percentage_state_topic: state(speed), percentage_command_topic: command(speed), speed_range_min: 1, speed_range_max: 100 } : {}),
    ...(oscillating
      ? { oscillation_state_topic: state(oscillating), oscillation_command_topic: command(oscillating), payload_oscillation_on: 'true', payload_oscillation_off: 'false' }
      : {}),
    // strings arrive as JSON
    ...(direction ? { direction_state_topic: state(direction), direction_value_template: '{{ value_json }}', direction_command_topic: command(direction) } : {}),
  };
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
      ...suggestedArea(camera.room),
    },
    origin: {
      name: 'camera.ui',
      sw_version: ConfigService.VERSION,
    },
  };
}

function suggestedArea(room: string | undefined): { suggested_area?: string } {
  return room && room !== 'Default' ? { suggested_area: room } : {};
}

function settingName(entityName: string | null, property: string): string {
  const label = capitalize(property.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`));
  return entityName ? `${entityName} ${label}` : label;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
