export interface FlowContext {
  variables: Map<string, string>;

  event?: {
    id: string;
    type: string;
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
}

export function createEmptyContext(): FlowContext {
  return { variables: new Map() };
}

export function seedVariables(context: FlowContext): void {
  if (context.event) {
    context.variables.set('event.id', context.event.id);
    context.variables.set('event.type', context.event.type);
    context.variables.set('event.confidence', String(context.event.confidence));
    context.variables.set('event.label', context.event.label);
    context.variables.set('event.cameraId', context.event.cameraId);
    context.variables.set('event.state', context.event.state);
    context.variables.set('event.faces', context.event.faces.join(', '));
    context.variables.set('event.plates', context.event.plates.join(', '));
  }

  if (context.sensor) {
    context.variables.set('sensor.value', context.sensor.value != null ? JSON.stringify(context.sensor.value) : '');
    context.variables.set('sensor.previousValue', context.sensor.previousValue != null ? JSON.stringify(context.sensor.previousValue) : '');
    context.variables.set('sensor.property', context.sensor.property);
    context.variables.set('sensor.sensorType', context.sensor.sensorType);
    context.variables.set('sensor.cameraId', context.sensor.cameraId);
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
    context.variables.set('system.eventType', context.system.eventType);
    if (context.system.cameraId) context.variables.set('system.cameraId', context.system.cameraId);
    if (context.system.cameraName) context.variables.set('system.cameraName', context.system.cameraName);
    if (context.system.pluginName) context.variables.set('system.pluginName', context.system.pluginName);
    if (context.system.pluginId) context.variables.set('system.pluginId', context.system.pluginId);
    if (context.system.status) context.variables.set('system.status', context.system.status);
    if (context.system.property) context.variables.set('system.property', context.system.property);
    if (context.system.sensorId) context.variables.set('system.sensorId', context.system.sensorId);
    if (context.system.sensorType) context.variables.set('system.sensorType', context.system.sensorType);
    if (context.system.sensorName) context.variables.set('system.sensorName', context.system.sensorName);
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

export function resolveTemplate(template: string, variables: Map<string, string>): string {
  let result = template.replace(/\{\{=\s*(.+?)\s*\}\}/g, (_, expr: string) => {
    const resolved = expr.replace(/(\w+(?:\.\w+)*)/g, (varMatch: string) => {
      if (varMatch === 'time.now') return String(Date.now());
      const val = variables.get(varMatch);
      if (val !== undefined) {
        const num = Number(val);
        return isNaN(num) ? `"${val}"` : String(num);
      }
      return varMatch;
    });
    const num = evaluateExpression(resolved);
    return Number.isInteger(num) ? String(num) : num.toFixed(2);
  });

  result = result.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, key: string) => {
    if (key === 'time.now') return String(Date.now());
    return variables.get(key) ?? '';
  });

  return result;
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
