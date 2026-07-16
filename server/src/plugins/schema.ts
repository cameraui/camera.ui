import { isEqual } from '@camera.ui/common/utils';
import * as zod from 'zod';

import type {
  JsonNumberSchema,
  JsonSchema,
  JsonSchemaArray,
  JsonSchemaBoolean,
  JsonSchemaButton,
  JsonSchemaEnum,
  JsonSchemaNumber,
  JsonSchemaString,
  JsonSchemaSubmit,
  JsonSchemaWithoutCallbacks,
  JsonSchemaWithoutKey,
  JsonStringSchema,
  SchemaCondition,
} from '@camera.ui/sdk';

export function isStringType(schema: JsonSchemaWithoutKey): schema is JsonSchemaString {
  return schema.type === 'string' && !('enum' in schema);
}

export function isNumberType(schema: JsonSchemaWithoutKey): schema is JsonSchemaNumber {
  return schema.type === 'number';
}

export function isBooleanType(schema: JsonSchemaWithoutKey): schema is JsonSchemaBoolean {
  return schema.type === 'boolean';
}

export function isEnumType(schema: JsonSchemaWithoutKey): schema is JsonSchemaEnum {
  return schema.type === 'string' && 'enum' in schema;
}

export function isArrayType(schema: JsonSchemaWithoutKey): schema is JsonSchemaArray {
  return schema.type === 'array';
}

export function isButtonType(schema: JsonSchemaWithoutKey): schema is JsonSchemaButton {
  return schema.type === 'button';
}

export function isSubmitType(schema: JsonSchemaWithoutKey): schema is JsonSchemaSubmit {
  return schema.type === 'submit';
}

export function isValidableStringType(schema: JsonSchemaWithoutKey): schema is JsonSchemaString {
  return isStringType(schema) && (!schema.format || (schema.format !== 'qrCode' && schema.format !== 'image'));
}

const evaluateSingleCondition = (condition: SchemaCondition, config: Record<string, any>): boolean => {
  const actual = getValueByKey(config, condition.key);
  const expected = condition.value;
  const op = condition.operator ?? 'eq';

  switch (op) {
    case 'eq':
      return actual === expected;
    case 'neq':
      // Treat empty/undefined as "no value" — don't match against negation
      if (actual === undefined || actual === null || actual === '') return false;
      return actual !== expected;
    case 'gt':
      return typeof actual === 'number' && typeof expected === 'number' && actual > expected;
    case 'lt':
      return typeof actual === 'number' && typeof expected === 'number' && actual < expected;
    case 'in': {
      const arr = Array.isArray(expected) ? expected : [expected];
      return arr.includes(actual);
    }
    case 'nin': {
      if (actual === undefined || actual === null || actual === '') return false;
      const arr = Array.isArray(expected) ? expected : [expected];
      return !arr.includes(actual);
    }
    default:
      return true;
  }
};

export function evaluateCondition(condition: SchemaCondition | SchemaCondition[], config: Record<string, any>): boolean {
  if (Array.isArray(condition)) {
    return condition.every((c) => evaluateSingleCondition(c, config));
  }
  return evaluateSingleCondition(condition, config);
}

export function isConfigDefault(config: Record<string, any>, schemas: JsonSchema[]): boolean {
  if (!config || Object.keys(config).length === 0) {
    return true;
  }

  const validSchemas = schemas.filter((schema) => !isButtonType(schema) && !isSubmitType(schema));

  for (const schema of validSchemas) {
    const currentValue = getValueByKey(config, schema.key);
    const defaultValue = generateDefaultValue(schema);

    if (currentValue === undefined) continue;

    if (!isEqual(currentValue, defaultValue, true)) {
      return false;
    }
  }

  return true;
}

export function generateDefaultValue(schema: JsonSchema): any {
  if ('defaultValue' in schema && schema.defaultValue !== undefined) {
    return schema.defaultValue;
  }

  switch (schema.type) {
    case 'string':
      if (isEnumType(schema)) {
        return schema.multiple ? [] : schema.required ? schema.enum[0] : '';
      }
      return '';
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'array':
      return [];
    default:
      return undefined;
  }
}

export function generateConfigFromSchemas(schemas: JsonSchema[]): Record<string, any> {
  const config: Record<string, any> = {};

  for (const schema of schemas) {
    if (isButtonType(schema) || isSubmitType(schema)) continue;

    config[schema.key] = generateDefaultValue(schema);
  }

  return config;
}

function splitKey(key: string): string[] {
  return key.split('.').reduce<string[]>((acc, part) => {
    if (part.includes('[')) {
      const [keyPart, indexPart] = part.split('[');
      acc.push(keyPart, indexPart.slice(0, -1));
    } else {
      acc.push(part);
    }
    return acc;
  }, []);
}

function isIndexKey(key: string): boolean {
  return !isNaN(Number(key));
}

export function getValueByKey(config: Record<string, any> = {}, key: string): any {
  if (!key.includes('.') && !key.includes('[')) {
    return config[key];
  }

  let current = config;
  for (const k of splitKey(key)) {
    if (current === undefined || current === null) {
      return undefined;
    }
    current = current[k];
  }

  return current;
}

export function setValueByKey(config: Record<string, any>, key: string, value: any): void {
  if (!key.includes('.') && !key.includes('[')) {
    config[key] = value;
    return;
  }

  const keys = splitKey(key);
  const lastKey = keys.pop();
  if (!lastKey) return;

  let current = config;
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (typeof current[k] !== 'object' || current[k] === null) {
      current[k] = isIndexKey(keys[i + 1] ?? lastKey) ? [] : {};
    }
    current = current[k];
  }

  current[lastKey] = value;
}

export function deleteValueByKey(config: Record<string, any>, key: string): void {
  if (!key.includes('.') && !key.includes('[')) {
    delete config[key];
    return;
  }

  const keys = splitKey(key);
  const lastKey = keys.pop();
  if (!lastKey) return;

  let current: any = config;
  for (const k of keys) {
    if (typeof current[k] !== 'object' || current[k] === null) {
      return;
    }
    current = current[k];
  }

  if (Array.isArray(current) && isIndexKey(lastKey)) {
    current.splice(Number(lastKey), 1);
  } else {
    delete current[lastKey];
  }
}

export function findSchemaByKey(schemas: JsonSchema[], key: string): JsonSchema | undefined {
  return schemas.find((schema) => schema.key === key);
}

export function removeCallbacksFromSchema(schema: JsonSchemaWithoutKey): JsonSchemaWithoutCallbacks {
  const { onSet, onGet, onClick, ...rest } = schema as any;

  if (isArrayType(rest) && rest.items) {
    rest.items = removeCallbacksFromSchema(rest.items);
  }

  return rest as JsonSchemaWithoutCallbacks;
}

export function removeCallbacksFromSchemas(schemas: JsonSchema[]): JsonSchemaWithoutCallbacks[] {
  return schemas.map((schema) => removeCallbacksFromSchema(schema));
}

export function generateStorableConfig(schemas: JsonSchema[], config: Record<string, any>): Record<string, any> {
  const storableConfig: Record<string, any> = {};

  for (const schema of schemas) {
    if ('store' in schema && schema.store && !isButtonType(schema) && !isSubmitType(schema)) {
      const value = getValueByKey(config, schema.key);
      if (value !== undefined) {
        storableConfig[schema.key] = value;
      }
    }
  }

  return storableConfig;
}

export function getSchemasByGroup(schemas: JsonSchema[], group: string): JsonSchema[] {
  if (!group) return schemas;
  return schemas.filter((schema) => 'group' in schema && schema.group === group);
}

export function schemaGroupIsReadonly(schemas: JsonSchema[], group: string): boolean {
  const groupSchemas = getSchemasByGroup(schemas, group);
  return groupSchemas.length > 0 && groupSchemas.every((schema) => 'readonly' in schema && schema.readonly);
}

export function schemaGroupIsStorable(schemas: JsonSchema[], group: string): boolean {
  const groupSchemas = getSchemasByGroup(schemas, group);
  return groupSchemas.length > 0 && groupSchemas.some((schema) => 'store' in schema && schema.store);
}

export function isValidFormat(value: string, format?: string): boolean {
  if (!format) return true;

  const validations: Record<string, (val: string) => boolean> = {
    'date-time': (val) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(.\d+)?(Z|[+-]\d{2}:\d{2})?$/.test(val),
    date: (val) => /^\d{4}-\d{2}-\d{2}$/.test(val),
    time: (val) => /^([01]?[0-9]|2[0-3]):([0-5][0-9])(:([0-5][0-9]))?$/.test(val),
    email: (val) => /^\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,7}\b$/.test(val),
    uuid: (val) => /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(val),
    ipv4: (val) => /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(val),
    ipv6: (val) => /^\s*([0-9a-fA-F]{1,4}:){7}([0-9a-fA-F]{1,4})\s*$/.test(val),
  };

  return format in validations ? validations[format](value) : true;
}

export function validateValue(value: any, schema: JsonSchemaWithoutKey): boolean {
  if (isButtonType(schema) || isSubmitType(schema)) return true;

  if ('required' in schema && schema.required && (value === undefined || value === null || value === '')) {
    return false;
  }

  switch (schema.type) {
    case 'string':
      if (isEnumType(schema)) {
        if (schema.multiple) {
          return Array.isArray(value) && value.every((v) => schema.enum.includes(v));
        } else {
          return schema.enum.includes(value);
        }
      } else {
        if (typeof value !== 'string') return false;
        if ((schema as JsonStringSchema).minLength !== undefined && value.length < (schema as JsonStringSchema).minLength!) return false;
        if ((schema as JsonStringSchema).maxLength !== undefined && value.length > (schema as JsonStringSchema).maxLength!) return false;
        if ((schema as JsonStringSchema).format) return isValidFormat(value, (schema as JsonStringSchema).format);
        return true;
      }

    case 'number':
      if (typeof value !== 'number') return false;
      if ((schema as JsonNumberSchema).minimum !== undefined && value < (schema as JsonNumberSchema).minimum!) return false;
      if ((schema as JsonNumberSchema).maximum !== undefined && value > (schema as JsonNumberSchema).maximum!) return false;
      return true;

    case 'boolean':
      return typeof value === 'boolean';

    case 'array':
      if (!Array.isArray(value)) return false;
      return value.every((item) => validateValue(item, (schema as JsonSchemaArray).items));

    default:
      return true;
  }
}

// When `required` is used with `group`, fields are only required if at least one field in the group has a value
export function validateConfig(config: Record<string, any>, schemas: JsonSchema[]): Record<string, string[]> {
  const errors: Record<string, string[]> = {};

  // Collect groups that have values
  const groupsWithValues = new Set<string>();
  for (const schema of schemas) {
    if ('group' in schema && (schema as any).group) {
      const value = getValueByKey(config, schema.key);
      if (value !== undefined && value !== null && value !== '') {
        groupsWithValues.add((schema as any).group);
      }
    }
  }

  for (const schema of schemas) {
    // Skip button and submit types
    if (isButtonType(schema) || isSubmitType(schema)) continue;

    // Skip fields whose condition is not met
    if ('condition' in schema && schema.condition) {
      if (!evaluateCondition(schema.condition, config)) continue;
    }

    const value = getValueByKey(config, schema.key);
    const fieldErrors: string[] = [];

    // Required field check - group-aware
    if ('required' in schema && schema.required && (value === undefined || value === null || value === '')) {
      const hasGroup = 'group' in schema && (schema as any).group;
      // If field has a group, only require if that group has values
      // If field has no group, always require
      if (!hasGroup || groupsWithValues.has((schema as any).group)) {
        fieldErrors.push('This field is required');
      }
    }

    // Type-specific validation
    if (value !== undefined && value !== null) {
      if (isStringType(schema)) {
        if (typeof value !== 'string') {
          fieldErrors.push('Value must be a string');
        } else {
          if (schema.minLength !== undefined && value.length < schema.minLength) {
            fieldErrors.push(`Minimum length is ${schema.minLength}`);
          }
          if (schema.maxLength !== undefined && value.length > schema.maxLength) {
            fieldErrors.push(`Maximum length is ${schema.maxLength}`);
          }
          if (schema.format && !isValidFormat(value, schema.format)) {
            fieldErrors.push(`Invalid ${schema.format} format`);
          }
        }
      } else if (isNumberType(schema)) {
        if (typeof value !== 'number') {
          fieldErrors.push('Value must be a number');
        } else {
          if (schema.minimum !== undefined && value < schema.minimum) {
            fieldErrors.push(`Minimum value is ${schema.minimum}`);
          }
          if (schema.maximum !== undefined && value > schema.maximum) {
            fieldErrors.push(`Maximum value is ${schema.maximum}`);
          }
        }
      } else if (isBooleanType(schema)) {
        if (typeof value !== 'boolean') {
          fieldErrors.push('Value must be a boolean');
        }
      } else if (isEnumType(schema)) {
        if (schema.multiple) {
          if (!Array.isArray(value)) {
            fieldErrors.push('Value must be an array');
          } else if (!value.every((v) => schema.enum.includes(v))) {
            fieldErrors.push('Invalid selection');
          }
        } else if (!schema.enum.includes(value)) {
          fieldErrors.push('Invalid selection');
        }
      } else if (isArrayType(schema)) {
        if (!Array.isArray(value)) {
          fieldErrors.push('Value must be an array');
        } else {
          value.forEach((item, index) => {
            if (!validateValue(item, schema.items)) {
              fieldErrors.push(`Invalid item at index ${index}`);
            }
          });
        }
      }
    }

    if (fieldErrors.length > 0) {
      errors[schema.key] = fieldErrors;
    }
  }

  return errors;
}

export function generateZodSchemaField(schema: JsonSchema): zod.ZodTypeAny {
  if (isButtonType(schema) || isSubmitType(schema)) {
    return zod.any();
  }

  switch (schema.type) {
    case 'string':
      if (isEnumType(schema)) {
        if (schema.multiple) {
          let arraySchema = zod.array(
            zod
              .string()
              .trim()
              .refine((val) => schema.enum.includes(val), { error: 'Invalid selection' }),
          );

          if (schema.required) {
            arraySchema = arraySchema.min(1, { error: 'Required' });
          }

          return schema.required ? arraySchema : arraySchema.optional();
        } else {
          const enumSchema = zod.enum(schema.enum as [string, ...string[]]);
          return schema.required ? enumSchema : enumSchema.optional();
        }
      }

      let strSchema = zod.string().trim();

      if (schema.required) {
        strSchema = strSchema.nonempty('Required');
      }

      if (schema.minLength !== undefined) {
        strSchema = strSchema.min(schema.minLength);
      }

      if (schema.maxLength !== undefined) {
        strSchema = strSchema.max(schema.maxLength);
      }

      if (schema.format) {
        strSchema = strSchema.refine((val) => !val || val.trim() === '' || isValidFormat(val, schema.format), {
          message: `Invalid ${schema.format} format`,
        });
      }

      return schema.required ? strSchema : strSchema.optional();

    case 'number':
      let numSchema = zod.number();

      if (schema.minimum !== undefined) {
        numSchema = numSchema.min(schema.minimum);
      }

      if (schema.maximum !== undefined) {
        numSchema = numSchema.max(schema.maximum);
      }

      if (schema.required) {
        numSchema = numSchema.refine((val) => val !== undefined && val !== null, { error: 'Required' });
      }

      return schema.required ? numSchema : numSchema.optional();

    case 'boolean':
      return schema.required ? zod.boolean() : zod.boolean().optional();

    case 'array':
      const schemaItems = schema.items ? generateZodSchemaField(schema.items as any) : zod.any();
      const arraySchema = zod.array(schemaItems);
      return schema.required ? arraySchema : arraySchema.optional();

    default:
      return (schema as any).required ? zod.any() : zod.any().optional();
  }
}

const groupHasValue = (data: Record<string, any>, schemas: JsonSchema[], group: string): boolean => {
  const groupSchemas = schemas.filter((s) => 'group' in s && (s as any).group === group);
  return groupSchemas.some((s) => {
    const value = data[s.key];
    return value !== undefined && value !== null && value !== '';
  });
};

// When `required` is used with `group`, fields are only required if at least one field in the group has a value
export function generateZodSchema(schemas: JsonSchema[]): zod.ZodObject<any> {
  const zodSchemaObj: Record<string, zod.ZodTypeAny> = {};

  const groups = new Set<string>();
  schemas.forEach((schema) => {
    if ('group' in schema && (schema as any).group) {
      groups.add((schema as any).group);
    }
  });

  schemas.forEach((schema) => {
    if (!isButtonType(schema) && !isSubmitType(schema)) {
      // Group/condition-required fields are validated in superRefine; keep them
      // optional at the field level so the UI can hide them without blocking validation.
      const hasGroup = 'group' in schema && (schema as any).group;
      const hasCondition = 'condition' in schema && schema.condition;
      if ((hasGroup || hasCondition) && schema.required) {
        zodSchemaObj[schema.key] = generateZodSchemaField({ ...schema, required: false });
      } else {
        zodSchemaObj[schema.key] = generateZodSchemaField(schema);
      }
    }
  });

  let zodSchema = zod.object(zodSchemaObj);

  const conditionSchemas = schemas.filter((s) => 'condition' in s && s.condition && 'required' in s && s.required && !isButtonType(s) && !isSubmitType(s));

  // Add group-level and condition-level required validation
  if (groups.size > 0 || conditionSchemas.length > 0) {
    zodSchema = zodSchema.superRefine((data, ctx) => {
      // Group-level conditional required validation
      for (const group of groups) {
        if (groupHasValue(data, schemas, group)) {
          const groupSchemas = schemas.filter((s) => 'group' in s && (s as any).group === group);

          for (const schema of groupSchemas) {
            if ('required' in schema && schema.required) {
              // Skip if condition is not met
              if ('condition' in schema && schema.condition && !evaluateCondition(schema.condition, data)) continue;
              const value = data[schema.key];
              if (value === undefined || value === null || value === '') {
                ctx.addIssue({
                  code: zod.ZodIssueCode.custom,
                  message: 'Required',
                  path: [schema.key],
                });
              }
            }
          }
        }
      }

      // Condition-level required validation (for fields without groups)
      for (const schema of conditionSchemas) {
        if ('group' in schema && (schema as any).group) continue;
        if ('condition' in schema && schema.condition && evaluateCondition(schema.condition, data)) {
          const value = data[schema.key];
          if (value === undefined || value === null || value === '') {
            ctx.addIssue({
              code: zod.ZodIssueCode.custom,
              message: 'Required',
              path: [schema.key],
            });
          }
        }
      }
    });
  }

  return zodSchema;
}
