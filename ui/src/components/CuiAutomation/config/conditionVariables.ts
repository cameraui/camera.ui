import type { AutomationNode } from '../types.js';

interface VariableOption {
  label: string;
  value: string;
}

export function getSourceVariables(sourceNode: AutomationNode | undefined): VariableOption[] {
  const sourceType = sourceNode?.type;
  if (!sourceType) return [];

  const options: VariableOption[] = [];

  if (sourceType === 'trigger-detection') {
    options.push(
      { label: 'Event — Confidence', value: '{{event.confidence}}' },
      { label: 'Event — Detection Type', value: '{{event.type}}' },
      { label: 'Event — Label', value: '{{event.label}}' },
      { label: 'Event — Camera', value: '{{event.cameraId}}' },
      { label: 'Event — State', value: '{{event.state}}' },
      { label: 'Event — Faces', value: '{{event.faces}}' },
      { label: 'Event — License Plates', value: '{{event.plates}}' },
    );
  } else if (sourceType === 'trigger-sensor') {
    options.push(
      { label: 'Sensor — Value', value: '{{sensor.value}}' },
      { label: 'Sensor — Previous Value', value: '{{sensor.previousValue}}' },
      { label: 'Sensor — Property', value: '{{sensor.property}}' },
    );
  } else if (sourceType === 'trigger-webhook') {
    options.push(
      { label: 'Webhook — Body', value: '{{webhook.body}}' },
      { label: 'Webhook — Data (binary base64)', value: '{{webhook.data}}' },
      { label: 'Webhook — Method', value: '{{webhook.method}}' },
      { label: 'Webhook — Headers', value: '{{webhook.headers}}' },
    );
  } else if (sourceType === 'trigger-system') {
    options.push(
      { label: 'System — Event Type', value: '{{system.eventType}}' },
      { label: 'System — Camera ID', value: '{{system.cameraId}}' },
      { label: 'System — Camera Name', value: '{{system.cameraName}}' },
      { label: 'System — Plugin Name', value: '{{system.pluginName}}' },
      { label: 'System — Plugin ID', value: '{{system.pluginId}}' },
      { label: 'System — Status', value: '{{system.status}}' },
      { label: 'System — Property', value: '{{system.property}}' },
      { label: 'System — Sensor ID', value: '{{system.sensorId}}' },
      { label: 'System — Sensor Type', value: '{{system.sensorType}}' },
      { label: 'System — Sensor Name', value: '{{system.sensorName}}' },
    );
  } else if (sourceType === 'action-http') {
    options.push(
      { label: 'HTTP — Status', value: '{{http.status}}' },
      { label: 'HTTP — Body', value: '{{http.body}}' },
      { label: 'HTTP — Base64 (binary)', value: '{{http.base64}}' },
      { label: 'Previous — Success', value: '{{previous.success}}' },
    );
  } else if (sourceType === 'action-snapshot') {
    options.push(
      { label: 'Snapshot (base64)', value: '{{snapshot}}' },
      { label: 'Snapshot (data URI)', value: '{{snapshot.base64}}' },
      { label: 'Previous — Result', value: '{{previous.result}}' },
      { label: 'Previous — Success', value: '{{previous.success}}' },
    );
  } else if (sourceType === 'action-plugin') {
    options.push(
      { label: 'Plugin — Detected', value: '{{plugin.detected}}' },
      { label: 'Plugin — Labels', value: '{{plugin.labels}}' },
      { label: 'Plugin — Detections (JSON)', value: '{{plugin.detections}}' },
      { label: 'Plugin — Result (JSON)', value: '{{plugin.result}}' },
      { label: 'Previous — Result', value: '{{previous.result}}' },
      { label: 'Previous — Success', value: '{{previous.success}}' },
    );
  } else if (sourceType.startsWith('action-')) {
    options.push({ label: 'Previous — Result', value: '{{previous.result}}' }, { label: 'Previous — Success', value: '{{previous.success}}' });
  }

  return options;
}
