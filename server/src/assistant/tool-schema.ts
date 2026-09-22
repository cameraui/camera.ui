import { convertSchemaToJsonSchema } from '@tanstack/ai';

import type { CoreTool } from './tools/shared.js';

const VALIDATION_KEYS = new Set(['additionalProperties', 'format', 'title', 'default', '$schema']);

const PROPERTY_MAPS = new Set(['properties', 'patternProperties', '$defs', 'definitions']);

const leaned = new WeakMap<object, unknown>();

export function leanTools(tools: CoreTool[]): CoreTool[] {
  return tools.map((tool) => {
    const schema = tool.inputSchema as Record<string, unknown> | undefined;
    if (!schema || typeof schema !== 'object') return tool;
    const lean = '~standard' in schema ? leanStandardSchema(schema) : leanPlainSchema(schema);
    return { ...tool, inputSchema: lean };
  });
}

export function leanJsonSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(leanJsonSchema);
  if (!node || typeof node !== 'object') return node;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (VALIDATION_KEYS.has(key)) continue;
    if (key === 'required' && Array.isArray(value) && !value.length) continue;
    // the keys of these maps are field names, a field called title or format stays
    out[key] = PROPERTY_MAPS.has(key) ? leanMap(value) : leanJsonSchema(value);
  }
  const anyOf = out.anyOf;
  if (Array.isArray(anyOf) && anyOf.length === 2) {
    const other = anyOf.find((branch) => !isNullBranch(branch));
    if (other && anyOf.some(isNullBranch) && typeof other === 'object') {
      delete out.anyOf;
      Object.assign(out, other);
    }
  }
  return out;
}

function leanStandardSchema(schema: Record<string, unknown>): unknown {
  const cached = leaned.get(schema);
  if (cached) return cached;

  const standard = schema['~standard'] as Record<string, unknown>;
  const json = leanJsonSchema(convertSchemaToJsonSchema(schema as never));
  const lean = Object.create(schema) as Record<string, unknown>;
  lean['~standard'] = { ...standard, jsonSchema: { input: () => json, output: () => json } };
  leaned.set(schema, lean);
  return lean;
}

function leanPlainSchema(schema: Record<string, unknown>): unknown {
  const cached = leaned.get(schema);
  if (cached) return cached;

  const lean = leanJsonSchema(schema);
  leaned.set(schema, lean);
  return lean;
}

function leanMap(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([name, schema]) => [name, leanJsonSchema(schema)]));
}

function isNullBranch(branch: unknown): boolean {
  return typeof branch === 'object' && branch !== null && (branch as { type?: unknown }).type === 'null';
}
