import { isEqual, mergeWith, structuredClone } from '@camera.ui/common/utils';
import { RPCMethod } from '@camera.ui/rpc';
import objectPath from 'object-path';

import { NamespaceManager } from '../../../rpc/namespaces.js';
import { generateConfigFromSchemas, getValueByKey, isButtonType, isSubmitType, removeCallbacksFromSchemas } from '../../schema.js';
import { deleteLocation, readLocation, writeLocation } from '../../store/location.js';
import { validateStoreValue } from '../../store/validate.js';

import type { RPCClient } from '@camera.ui/rpc';
import type { DeviceStorage as DeviceStorageInterface, FormSubmitResponse, JsonSchema, PluginInfo, SchemaConfig } from '@camera.ui/sdk';
import type { StoreLocation } from '../../store/location.js';
import type { PluginConfigDb } from './configDb.js';
import type { PluginAPI } from './pluginApi.js';

export class DeviceStorage<T extends Record<string, any> = Record<string, any>> implements DeviceStorageInterface<T> {
  public values: T = {} as T;

  #location: StoreLocation;
  #api: PluginAPI;
  #proxy: RPCClient;
  #plugin: PluginInfo;
  #pluginDb: PluginConfigDb;

  #storageNamespace: string;
  #sensorId?: string;

  #dirty = false;

  #closeProxy?: () => Promise<void>;

  constructor(
    api: PluginAPI,
    proxy: RPCClient,
    plugin: PluginInfo,
    pluginDb: PluginConfigDb,
    location: StoreLocation,
    public schemas: JsonSchema[] = [],
    sensorId?: string,
  ) {
    this.#api = api;
    this.#proxy = proxy;
    this.#plugin = plugin;
    this.#pluginDb = pluginDb;
    this.#location = location;
    this.#sensorId = sensorId;

    if (location.kind === 'sensor' && this.#sensorId) {
      const sensorNs = NamespaceManager.pluginSensorNamespaces(this.#plugin.id, location.cameraId, this.#sensorId);
      this.#storageNamespace = sensorNs.sensorStorageRpc;
    } else if (location.kind === 'plugin') {
      const pluginNs = NamespaceManager.pluginNamespaces(this.#plugin.id);
      this.#storageNamespace = pluginNs.pluginStorageRpc;
    } else if (location.kind === 'camera') {
      const cameraNs = NamespaceManager.pluginCameraNamespaces(this.#plugin.id, location.cameraId);
      this.#storageNamespace = cameraNs.cameraStorageRpc;
    } else {
      throw new Error(`sensor storage for ${this.#plugin.id} requires a sensorId`);
    }
  }

  public getValue<T = string>(key: string): Promise<T> | undefined;
  public getValue<T = string>(key: string, defaultValue: T): Promise<T>;
  @RPCMethod
  public getValue<T = string>(key: string, defaultValue?: T): Promise<T> | undefined {
    const schema = this.schemas.find((schema) => schema.key === key);
    const configValue = objectPath.get(this.values, key);
    return (schema as any)?.onGet?.() ?? configValue ?? (schema as any)?.defaultValue ?? defaultValue;
  }

  @RPCMethod
  public async setValue<T = string>(key: string, newValue: T): Promise<void> {
    const schema = this.schemas.find((schema) => schema.key === key);

    if (schema) {
      validateStoreValue(key, newValue);
      const oldValue = objectPath.get(this.values, key);
      const unchanged = newValue === null || newValue === undefined ? oldValue === undefined : isEqual(oldValue, newValue);
      if (newValue === null || newValue === undefined) {
        objectPath.del(this.values, key);
      } else {
        objectPath.set(this.values, key, typeof newValue === 'object' ? structuredClone(newValue) : newValue);
      }

      if (this.#containsStorableSchema(schema) && (!unchanged || this.#dirty)) {
        await this.save();
      }

      this.#runOnSetDetached((schema as any).onSet, key, newValue, oldValue);
    }
  }

  @RPCMethod
  public async submitValue(key: string, newValue: any): Promise<FormSubmitResponse | void> {
    const schema = this.schemas.find((schema) => schema.key === key);

    if (schema?.type === 'submit') {
      return schema.onClick(newValue);
    }
  }

  @RPCMethod
  public async setInternalValue(key: string, value: unknown): Promise<void> {
    validateStoreValue(key, value);
    const oldValue = objectPath.get(this.values, key);
    const unchanged = value === null || value === undefined ? oldValue === undefined : isEqual(oldValue, value);
    if (value === null || value === undefined) {
      objectPath.del(this.values, key);
    } else {
      objectPath.set(this.values, key, typeof value === 'object' ? structuredClone(value) : value);
    }

    if (unchanged && !this.#dirty) {
      return;
    }
    await this.save();
  }

  @RPCMethod
  public hasValue(key: string): boolean {
    const configValue = objectPath.get(this.values, key);
    return configValue !== undefined;
  }

  @RPCMethod
  public async getConfig(): Promise<SchemaConfig> {
    await this.#resolveOnGetFunctions(this.schemas);
    const filteredSchema = removeCallbacksFromSchemas(this.schemas);
    const schemaConfig: SchemaConfig = { schema: filteredSchema, config: this.values };
    return schemaConfig;
  }

  @RPCMethod
  public async setConfig(newConfig: T): Promise<void> {
    validateStoreValue('config', newConfig);
    const oldConfig = structuredClone(this.values);

    this.values = mergeWith(this.values, newConfig, (source: any, target: any) => {
      if (Array.isArray(source)) {
        return target;
      }
    });

    await this.save();
    this.#triggerOnSetForChanges(oldConfig, this.values);
  }

  public defineSchemas(schemas: JsonSchema[]): void {
    this.schemas = schemas;
    this.#initializeStorage();
  }

  @RPCMethod
  public async addSchema(schema: JsonSchema): Promise<void> {
    const schemaExist = this.hasSchema(schema.key);
    if (schemaExist) {
      throw new Error(`Schema with key ${schema.key} already exists`);
    } else {
      this.schemas.push(schema);
    }

    const oldValue = objectPath.get(this.values, schema.key);
    await this.#resolveOnGetFunctions(schema);

    if (this.#containsStorableSchema(schema) && !isEqual(oldValue, objectPath.get(this.values, schema.key), true)) {
      await this.save();
    }
  }

  @RPCMethod
  public async removeSchema(key: string): Promise<void> {
    const schema = this.schemas.find((schema) => schema.key === key);
    const hadValue = objectPath.get(this.values, key) !== undefined;
    this.schemas = this.schemas.filter((schema) => schema.key !== key);
    objectPath.del(this.values, key);

    if (schema && this.#containsStorableSchema(schema) && hadValue) {
      await this.save();
    }
  }

  @RPCMethod
  public async changeSchema(key: string, newSchema: JsonSchema): Promise<void> {
    newSchema.key = key;
    const index = this.schemas.findIndex((schema) => schema.key === key);
    if (index === -1) {
      return;
    }

    const wasStorable = this.#containsStorableSchema(this.schemas[index]);
    this.schemas[index] = newSchema;

    if (this.#containsStorableSchema(newSchema) !== wasStorable) {
      this.#dirty = true;
    }

    const oldValue = objectPath.get(this.values, key);
    await this.#resolveOnGetFunctions(newSchema);

    if (this.#containsStorableSchema(newSchema) && !isEqual(oldValue, objectPath.get(this.values, key), true)) {
      await this.save();
    }
  }

  @RPCMethod
  public getSchema<T>(key: string): T | undefined {
    return this.schemas.find((schema) => schema.key === key) as T | undefined;
  }

  @RPCMethod
  public hasSchema(key: string): boolean {
    const schema = this.schemas.find((schema) => schema.key === key);
    return !!schema;
  }

  @RPCMethod
  public async destroy(): Promise<void> {
    const config = this.#pluginDb.get('config') ?? {};
    deleteLocation(config, this.#location);
    this.values = {} as T;
    await this.#pluginDb.put('config', config);
  }

  public async save(): Promise<void> {
    const config = this.#pluginDb.get('config') ?? {};
    const storableConfig = this.schemas.length ? this.#filterStorableValues(this.schemas) : this.values;
    writeLocation(config, this.#location, storableConfig);
    try {
      await this.#pluginDb.put('config', config);
      this.#dirty = false;
    } catch (error) {
      this.#dirty = true;
      throw error;
    }
  }

  public updateSchema(schemas: JsonSchema[] = []): void {
    this.schemas = schemas;
    this.#initializeStorage();
  }

  public async registerStorage(): Promise<void> {
    this.#closeProxy = await this.#proxy.registerHandler(this.#storageNamespace, this);
  }

  public async unregisterStorage(): Promise<void> {
    await this.#closeProxy?.();
  }

  /** Internal method to close the storage */
  public async close(): Promise<void> {
    try {
      await this.save();
      await this.unregisterStorage();
    } catch (error) {
      this.#api.logger.error('store: close save failed:', error);
    }
  }

  async #resolveOnGetFunctions(schemas: JsonSchema | JsonSchema[]): Promise<void> {
    if (!Array.isArray(schemas)) {
      schemas = [schemas];
    }

    for (const schema of schemas) {
      if (!isButtonType(schema) && !isSubmitType(schema) && typeof schema.onGet === 'function') {
        const schemaValue = await this.getValue(schema.key);
        if (schemaValue !== undefined && schemaValue !== null) {
          objectPath.set(this.values, schema.key, schemaValue);
        }
      }
    }
  }

  #triggerOnSetForChanges(oldConfig: Record<string, any>, newConfig: Record<string, any>): void {
    for (const configKey in newConfig) {
      const oldValue = getValueByKey(oldConfig, configKey);
      const newValue = newConfig[configKey];

      if (!isEqual(oldValue, newValue, true)) {
        const schema = this.schemas.find((schema) => schema.key === configKey);
        if (schema && !isSubmitType(schema) && typeof schema.onSet === 'function') {
          this.#runOnSetDetached(schema.onSet, configKey, newValue, oldValue);
        }
      }
    }
  }

  #runOnSetDetached(onSet: unknown, key: string, newValue: unknown, oldValue: unknown): void {
    if (typeof onSet !== 'function') {
      return;
    }

    (async () => onSet(newValue, oldValue))().catch((error: unknown) => {
      this.#api.logger.error(`onSet handler for "${key}" failed: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  #filterStorableValues(schemas: JsonSchema[], result: Record<string, any> = {}): Record<string, any> {
    for (const schema of schemas) {
      if (isButtonType(schema) || isSubmitType(schema)) {
        continue;
      }

      if (schema.store) {
        const configValue = getValueByKey(this.values, schema.key);
        objectPath.set(result, schema.key, configValue);
      }
    }

    // Keys without any schema are internal values and always persist;
    // schema-covered keys persist only via their store flag above.
    for (const [key, value] of Object.entries(this.values)) {
      if (!schemas.some((schema) => schema.key === key || schema.key.startsWith(`${key}.`))) {
        result[key] = value;
      }
    }

    return result;
  }

  #containsStorableSchema(schema: JsonSchema): boolean {
    if (schema.type === 'button' || schema.type === 'submit') {
      return false;
    }

    if ('store' in schema && schema.store) {
      return true;
    }

    return false;
  }

  async #initializeStorage(): Promise<void> {
    const config = this.#pluginDb.get('config') ?? {};
    const deviceConfig = readLocation(config, this.#location) ?? {};
    const schemaConfig = generateConfigFromSchemas(this.schemas);

    this.values = mergeWith(schemaConfig, deviceConfig, (source: any, target: any) => {
      if (Array.isArray(source)) {
        return target;
      }

      if (target === undefined) {
        return source;
      }
    }) as T;
  }
}
