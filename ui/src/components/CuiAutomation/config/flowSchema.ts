import { getObservableSensorProperties, getSensorPropertySpec } from '@shared/types';

import type { SensorPropertySpec } from '@camera.ui/sdk';
import type { ComputedRef } from 'vue';
import type { AutomationFlow, AutomationNodeData } from '../types.js';

export type FlowValueType = 'boolean' | 'number' | 'string' | 'enum' | 'object';

export interface FlowVariableValue {
  value: string;
  labelKey?: string;
}

export interface FlowVariable {
  /** Template form, e.g. `{{sensor.value}}`. */
  template: string;
  /** i18n key under components.automation_nodes, unset for user-named variables. */
  labelKey?: string;
  /** Literal label for user-named variables. */
  label?: string;
  valueType: FlowValueType;
  /** Known or configured values, used as case/operand suggestions. */
  values?: FlowVariableValue[];
  sourceNodeId: string;
  sourceType: string;
}

interface RawNode {
  id: string;
  type?: string;
  data?: Record<string, unknown>;
}

interface RawEdge {
  source: string;
  target: string;
}

export function getFlowVariables(flow: AutomationFlow | null, nodeId: string): FlowVariable[] {
  if (!flow) return [];

  const variables: FlowVariable[] = [];
  const seen = new Set<string>();
  const visited = new Set<string>();
  collect(flow, nodeId, variables, seen, visited);
  return variables;
}

export function findFlowVariable(flow: AutomationFlow | null, nodeId: string, template: string): FlowVariable | undefined {
  const trimmed = (template ?? '').trim();
  if (!trimmed) return undefined;
  return getFlowVariables(flow, nodeId).find((v) => v.template === trimmed);
}

export interface FlowVariableOption {
  label: string;
  value: string;
}

export function useFlowVariables(nodeId: MaybeRefOrGetter<string>): {
  variables: ComputedRef<FlowVariable[]>;
  options: ComputedRef<FlowVariableOption[]>;
} {
  const store = useAutomationsStore();
  const { t } = useI18n();

  const variables = computed(() => getFlowVariables(store.draft as AutomationFlow | null, toValue(nodeId)));
  const options = computed(() =>
    variables.value.map((v) => ({
      label: v.labelKey ? t(`components.automation_nodes.${v.labelKey}`) : (v.label ?? v.template),
      value: v.template,
    })),
  );

  return { variables, options };
}

export function flowValueOptions(variable: FlowVariable | undefined, t: (key: string) => string): FlowVariableOption[] {
  if (!variable?.values) return [];
  return variable.values.map((v) => ({
    label: v.labelKey ? `${t(`components.automation_nodes.${v.labelKey}`)} (${v.value})` : v.value,
    value: v.value,
  }));
}

function collect(flow: AutomationFlow, nodeId: string, variables: FlowVariable[], seen: Set<string>, visited: Set<string>): void {
  if (visited.has(nodeId)) return;
  visited.add(nodeId);

  const edges = flow.edges as unknown as RawEdge[];
  const nodes = flow.nodes as unknown as RawNode[];

  for (const edge of edges) {
    if (edge.target !== nodeId) continue;
    const source = nodes.find((n) => n.id === edge.source);
    if (!source?.type) continue;

    const produced = producersFor(source);
    const alias = typeof source.data?.alias === 'string' ? source.data.alias : undefined;
    for (const variable of produced) {
      if (alias) {
        const aliased = { ...variable, template: variable.template.replace('{{', `{{${alias}.`), label: `${alias}: ${variable.label ?? ''}`.trim() };
        if (!seen.has(aliased.template)) {
          seen.add(aliased.template);
          variables.push(aliased);
        }
      }
      if (!seen.has(variable.template)) {
        seen.add(variable.template);
        variables.push(variable);
      }
    }

    collect(flow, edge.source, variables, seen, visited);
  }
}

function producersFor(node: RawNode): FlowVariable[] {
  const data = (node.data ?? {}) as Partial<AutomationNodeData> & Record<string, unknown>;
  const out: FlowVariable[] = [];
  const add = (template: string, valueType: FlowValueType, labelKey: string, values?: FlowVariableValue[], label?: string) => {
    out.push({
      template,
      valueType,
      labelKey,
      sourceNodeId: node.id,
      sourceType: node.type ?? '',
      ...(values && values.length > 0 ? { values } : {}),
      ...(label ? { label } : {}),
    });
  };

  switch (node.type) {
    case 'trigger-detection': {
      const labels = ((data.detectionLabels as string[]) ?? []).map((l) => ({ value: l }));
      add('{{event.type}}', 'enum', 'variable_event_type', labels);
      add('{{event.types}}', 'string', 'variable_event_types');
      add('{{event.label}}', 'string', 'variable_event_label', labels);
      add('{{event.confidence}}', 'number', 'variable_event_confidence');
      add('{{event.state}}', 'enum', 'variable_event_state', [
        { value: 'active', labelKey: 'variable_value_active' },
        { value: 'ended', labelKey: 'variable_value_ended' },
      ]);
      add('{{event.cameraId}}', 'string', 'variable_event_camera');
      add(
        '{{event.faces}}',
        'string',
        'variable_event_faces',
        ((data.faceFilter as string[]) ?? []).map((f) => ({ value: f })),
      );
      add(
        '{{event.plates}}',
        'string',
        'variable_event_plates',
        ((data.licensePlateFilter as string[]) ?? []).map((p) => ({ value: p })),
      );
      add('{{event.id}}', 'string', 'variable_event_id');
      break;
    }

    case 'trigger-sensor': {
      const sensorType = String(data.sensorType ?? '');
      const watched = ((data.properties as string[]) ?? []).length > 0 ? (data.properties as string[]) : getObservableSensorProperties(sensorType);
      const specs = watched.map((p) => getSensorPropertySpec(sensorType, p)).filter((s): s is SensorPropertySpec => !!s);

      add('{{sensor.value}}', unionValueType(specs), 'variable_sensor_value', sensorValueSuggestions(sensorType, specs));
      add('{{sensor.previousValue}}', unionValueType(specs), 'variable_sensor_previous_value');
      // object values are seeded as scalar paths (sensor.value.pan) at run time
      for (const property of watched) {
        const spec = getSensorPropertySpec(sensorType, property);
        for (const key of spec?.keys ?? []) {
          out.push({
            template: `{{sensor.value.${key}}}`,
            valueType: 'number',
            label: `${property}.${key}`,
            sourceNodeId: node.id,
            sourceType: node.type,
          });
        }
      }
      add(
        '{{sensor.property}}',
        'enum',
        'variable_sensor_property',
        watched.map((p) => ({ value: p, labelKey: `sensor_property_${p}` })),
      );
      add('{{sensor.sensorType}}', 'string', 'variable_sensor_type');
      add('{{sensor.cameraId}}', 'string', 'variable_sensor_camera');
      break;
    }

    case 'trigger-webhook':
      add('{{webhook.body}}', 'string', 'variable_webhook_body');
      add('{{webhook.data}}', 'string', 'variable_webhook_data');
      add(
        '{{webhook.method}}',
        'enum',
        'variable_webhook_method',
        ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => ({ value: m })),
      );
      add('{{webhook.headers}}', 'object', 'variable_webhook_headers');
      break;

    case 'trigger-mqtt': {
      const topic = typeof data.topic === 'string' && data.topic ? [{ value: data.topic }] : undefined;
      add('{{mqtt.topic}}', 'string', 'variable_mqtt_topic', topic);
      add('{{mqtt.payload}}', 'string', 'variable_mqtt_payload');
      break;
    }

    case 'trigger-geofence': {
      const eventFilter = (data.event as string) ?? 'both';
      const events = eventFilter === 'both' ? ['enter', 'leave'] : [eventFilter];
      add(
        '{{geo.event}}',
        'enum',
        'variable_geo_event',
        events.map((e) => ({ value: e, labelKey: `variable_value_${e}` })),
      );
      add(
        '{{geo.user}}',
        'enum',
        'variable_geo_user',
        ((data.users as string[]) ?? []).map((u) => ({ value: u })),
      );
      add('{{geo.zone}}', 'string', 'variable_geo_zone', typeof data.zoneName === 'string' && data.zoneName ? [{ value: data.zoneName }] : undefined);
      add('{{geo.lat}}', 'number', 'variable_geo_lat');
      add('{{geo.lon}}', 'number', 'variable_geo_lon');
      add('{{geo.distance}}', 'number', 'variable_geo_distance');
      break;
    }

    case 'trigger-system':
      add('{{system.eventType}}', 'enum', 'variable_system_event_type', typeof data.eventType === 'string' && data.eventType ? [{ value: data.eventType }] : undefined);
      add('{{system.cameraId}}', 'string', 'variable_system_camera_id');
      add('{{system.cameraName}}', 'string', 'variable_system_camera_name');
      add('{{system.pluginName}}', 'string', 'variable_system_plugin_name');
      add('{{system.pluginId}}', 'string', 'variable_system_plugin_id');
      add('{{system.status}}', 'string', 'variable_system_status');
      add('{{system.property}}', 'string', 'variable_system_property');
      add('{{system.sensorId}}', 'string', 'variable_system_sensor_id');
      add('{{system.sensorType}}', 'string', 'variable_system_sensor_type');
      add('{{system.sensorName}}', 'string', 'variable_system_sensor_name');
      break;

    case 'action-snapshot':
      add('{{snapshot}}', 'string', 'variable_snapshot');
      add('{{snapshot.base64}}', 'string', 'variable_snapshot_data_uri');
      break;

    case 'action-http':
      add('{{http.status}}', 'number', 'variable_http_status');
      add('{{http.body}}', 'string', 'variable_http_body');
      add('{{http.base64}}', 'string', 'variable_http_base64');
      add('{{http.json}}', 'object', 'variable_http_json');
      break;

    case 'action-plugin':
      add('{{plugin.detected}}', 'boolean', 'variable_plugin_detected', [{ value: 'true' }, { value: 'false' }]);
      add('{{plugin.labels}}', 'string', 'variable_plugin_labels');
      add('{{plugin.detections}}', 'object', 'variable_plugin_detections');
      add('{{plugin.result}}', 'object', 'variable_plugin_result');
      add('{{plugin.durationMs}}', 'number', 'variable_plugin_duration');
      break;

    case 'action-camera-control':
      add('{{camera.id}}', 'string', 'variable_camera_id');
      add('{{camera.name}}', 'string', 'variable_camera_name');
      break;

    case 'action-image-input': {
      const name = typeof data.variableName === 'string' && data.variableName ? data.variableName : 'image';
      out.push({ template: `{{${name}}}`, valueType: 'string', label: name, sourceNodeId: node.id, sourceType: node.type });
      out.push({ template: `{{${name}.width}}`, valueType: 'number', label: `${name}.width`, sourceNodeId: node.id, sourceType: node.type });
      out.push({ template: `{{${name}.height}}`, valueType: 'number', label: `${name}.height`, sourceNodeId: node.id, sourceType: node.type });
      break;
    }

    case 'action-variable':
      if (typeof data.variableName === 'string' && data.variableName) {
        out.push({ template: `{{${data.variableName}}}`, valueType: 'string', label: data.variableName, sourceNodeId: node.id, sourceType: node.type });
      }
      break;
  }

  // repeat.index/iteration stay per-iteration only in sequential mode
  if (typeof data.repeat === 'number' && data.repeat > 1) {
    const concurrent = typeof data.repeatConcurrency === 'number' && data.repeatConcurrency > 1;
    if (!concurrent) {
      add('{{repeat.index}}', 'number', 'variable_repeat_index');
      add('{{repeat.iteration}}', 'number', 'variable_repeat_iteration');
    }
    add('{{repeat.total}}', 'number', 'variable_repeat_total');
    add('{{repeat.totalCalls}}', 'number', 'variable_repeat_total_calls');
    add('{{repeat.elapsedMs}}', 'number', 'variable_repeat_elapsed_ms');
    add('{{repeat.elapsedSec}}', 'number', 'variable_repeat_elapsed_sec');
  }

  const isAction = (node.type ?? '').startsWith('action-');
  if (isAction) {
    add('{{previous.success}}', 'boolean', 'variable_previous_success', [{ value: 'true' }, { value: 'false' }]);
    add('{{previous.result}}', 'string', 'variable_previous_result');
  }

  return out;
}

function unionValueType(specs: SensorPropertySpec[]): FlowValueType {
  const types = new Set(specs.map((s) => s.type));
  if (types.size === 1) return [...types][0] as FlowValueType;
  return 'string';
}

function sensorValueSuggestions(sensorType: string, specs: SensorPropertySpec[]): FlowVariableValue[] {
  const values: FlowVariableValue[] = [];
  const seen = new Set<string>();
  const push = (value: string, labelKey?: string) => {
    if (seen.has(value)) return;
    seen.add(value);
    values.push({ value, ...(labelKey ? { labelKey } : {}) });
  };

  for (const spec of specs) {
    if (spec.type === 'boolean') {
      push('true');
      push('false');
    } else if (spec.type === 'enum' && spec.values) {
      for (const [name, wire] of Object.entries(spec.values)) {
        push(String(wire), `${sensorType}_state_${name}`);
      }
    }
  }

  return values;
}
