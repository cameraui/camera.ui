export interface FlowContext {
  variables: Map<string, string>;

  event?: {
    id: string;
    type: string;
    types: string[];
    confidence: number;
    label: string;
    cameraId: string;
    state: string;
    faces: string[];
    plates: string[];
  };

  sensor?: {
    value: unknown;
    previousValue: unknown;
    property: string;
    sensorType: string;
    cameraId: string;
  };

  webhook?: {
    body: unknown;
    method: string;
    headers: Record<string, string>;
  };

  system?: {
    eventType: string;
    cameraId?: string;
    cameraName?: string;
    pluginName?: string;
    pluginId?: string;
    status?: string;
    property?: string;
    sensorId?: string;
    sensorType?: string;
    sensorName?: string;
  };

  geofence?: {
    user: string;
    event: 'enter' | 'leave';
    zone: string;
    lat: number;
    lon: number;
    distance: number;
  };

  mqtt?: {
    topic: string;
    payload: string;
  };
}

export function createEmptyContext(): FlowContext {
  return { variables: new Map() };
}

export function seedVariables(context: FlowContext): void {
  if (context.event) {
    context.variables.set('event.id', context.event.id);
    context.variables.set('event.type', context.event.type);
    context.variables.set('event.types', context.event.types.join(', '));
    context.variables.set('event.confidence', String(context.event.confidence));
    context.variables.set('event.label', context.event.label);
    context.variables.set('event.cameraId', context.event.cameraId);
    context.variables.set('event.state', context.event.state);
    context.variables.set('event.faces', context.event.faces.join(', '));
    context.variables.set('event.plates', context.event.plates.join(', '));
  }

  if (context.sensor) {
    context.variables.set('sensor.value', stringifyValue(context.sensor.value));
    context.variables.set('sensor.previousValue', stringifyValue(context.sensor.previousValue));
    context.variables.set('sensor.property', context.sensor.property);
    context.variables.set('sensor.sensorType', context.sensor.sensorType);
    context.variables.set('sensor.cameraId', context.sensor.cameraId);
    seedValuePaths(context.variables, 'sensor.value', context.sensor.value);
    seedValuePaths(context.variables, 'sensor.previousValue', context.sensor.previousValue);
  }

  if (context.webhook) {
    const body = context.webhook.body;
    if (Buffer.isBuffer(body)) {
      context.variables.set('webhook.body', body.toString('base64'));
      context.variables.set('webhook.data', body.toString('base64'));
    } else if (typeof body === 'string') {
      context.variables.set('webhook.body', body);
    } else if (typeof body === 'object' && body !== null) {
      context.variables.set('webhook.body', JSON.stringify(body));
      for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          context.variables.set(`webhook.${key}`, String(value));
        }
      }
    }
    context.variables.set('webhook.method', context.webhook.method);
    context.variables.set('webhook.headers', JSON.stringify(context.webhook.headers));
  }

  if (context.system) {
    // event payloads carry more keys than the typed interface, seed every scalar
    for (const [key, value] of Object.entries(context.system)) {
      if (value === undefined || value === null) continue;
      if (typeof value === 'object') continue;
      context.variables.set(`system.${key}`, String(value));
    }
  }

  if (context.mqtt) {
    context.variables.set('mqtt.topic', context.mqtt.topic);
    context.variables.set('mqtt.payload', context.mqtt.payload);

    try {
      const parsed = JSON.parse(context.mqtt.payload) as unknown;
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
          if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            context.variables.set(`mqtt.${key}`, String(value));
          }
        }
      }
    } catch {
      // non-JSON payload — mqtt.payload carries the raw text
    }
  }

  if (context.geofence) {
    context.variables.set('geo.user', context.geofence.user);
    context.variables.set('geo.event', context.geofence.event);
    context.variables.set('geo.zone', context.geofence.zone);
    context.variables.set('geo.lat', String(context.geofence.lat));
    context.variables.set('geo.lon', String(context.geofence.lon));
    context.variables.set('geo.distance', String(Math.round(context.geofence.distance)));
  }
}

export function resolveTemplate(template: string, variables: Map<string, string>, warn?: (message: string) => void): string {
  let result = template.replace(/\{\{=\s*(.+?)\s*\}\}/g, (_, expr: string) => {
    const resolved = expr.replace(/(\w+(?:\.\w+)*)/g, (varMatch: string) => {
      if (varMatch === 'time.now') return String(Date.now());
      const val = variables.get(varMatch);
      if (val !== undefined) {
        const num = val.trim() === '' ? NaN : Number(val);
        if (isNaN(num)) {
          warn?.(`variable "${varMatch}" is not a number ("${val}") and counts as 0 in "{{= ${expr} }}"`);
          return `"${val}"`;
        }
        return String(num);
      }
      if (!/^[\d.]+$/.test(varMatch)) warn?.(`unknown variable "${varMatch}" in "{{= ${expr} }}"`);
      return varMatch;
    });
    const num = evaluateExpression(resolved);
    return Number.isInteger(num) ? String(num) : num.toFixed(2);
  });

  result = result.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, key: string) => {
    if (key === 'time.now') return String(Date.now());
    const val = variables.get(key);
    if (val === undefined) warn?.(`unknown variable "{{${key}}}" resolved to an empty string`);
    return val ?? '';
  });

  return result;
}

function stringifyValue(value: unknown): string {
  if (value == null) return '';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function seedValuePaths(variables: Map<string, string>, prefix: string, value: unknown): void {
  if (value === null || typeof value !== 'object') return;

  if (Array.isArray(value)) {
    variables.set(`${prefix}.length`, String(value.length));
    for (const [index, entry] of value.entries()) {
      if (entry === null || typeof entry !== 'object') variables.set(`${prefix}.${index}`, stringifyValue(entry));
    }
    return;
  }

  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (entry === null || typeof entry !== 'object') variables.set(`${prefix}.${key}`, stringifyValue(entry));
  }
}

function evaluateExpression(expr: string): number {
  let pos = 0;
  const str = expr.replace(/\s+/g, '');

  function parseExpr(): number {
    let result = parseTerm();
    while (pos < str.length && (str[pos] === '+' || str[pos] === '-')) {
      const op = str[pos++];
      const right = parseTerm();
      result = op === '+' ? result + right : result - right;
    }
    return result;
  }

  function parseTerm(): number {
    let result = parseFactor();
    while (pos < str.length && (str[pos] === '*' || str[pos] === '/' || str[pos] === '%')) {
      const op = str[pos++];
      const right = parseFactor();
      if (op === '*') result *= right;
      else if (op === '/') result = right !== 0 ? result / right : 0;
      else result = right !== 0 ? result % right : 0;
    }
    return result;
  }

  function parseFactor(): number {
    if (str[pos] === '(') {
      pos++;
      const result = parseExpr();
      if (str[pos] === ')') pos++;
      return result;
    }
    if (str[pos] === '-') {
      pos++;
      return -parseFactor();
    }
    const start = pos;
    while (pos < str.length && ((str[pos] >= '0' && str[pos] <= '9') || str[pos] === '.')) {
      pos++;
    }
    const num = Number(str.slice(start, pos));
    return isNaN(num) ? 0 : num;
  }

  try {
    return parseExpr();
  } catch {
    return 0;
  }
}
