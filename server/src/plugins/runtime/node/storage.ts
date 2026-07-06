import { isEqual, mergeWith, structuredClone } from '@camera.ui/common/utils';
import { RPCClass, RPCMethod } from '@camera.ui/rpc';
import { API_EVENT } from '@camera.ui/sdk';
import objectPath from 'object-path';

import { NamespaceManager } from '../../../rpc/namespaces.js';
import { generateConfigFromSchemas, getValueByKey, isButtonType, isSubmitType, removeCallbacksFromSchemas } from '../../schema.js';

import type { RPCClient } from '@camera.ui/rpc';
import type { DeviceStorage as DeviceStorageInterface, FormSubmitResponse, JsonSchema, PluginInfo, SchemaConfig } from '@camera.ui/sdk';
import type { PluginConfigDb } from './configDb.js';
import type { PluginAPI } from './pluginApi.js';

@RPCClass
export class DeviceStorage<T extends Record<string, any> = Record<string, any>> implements DeviceStorageInterface<T> {
  public values: T = {} as T;

  #deviceId: string;
  #api: PluginAPI;
  #proxy: RPCClient;
  #plugin: PluginInfo;
  #pluginDb: PluginConfigDb;

  #storageNamespace: string;
  #isPluginStorage: boolean;
  #sensorId?: string;
  #cameraId?: string;

  #closeProxy?: () => Promise<void>;

  constructor(
    api: PluginAPI,
    proxy: RPCClient,
    plugin: PluginInfo,
    pluginDb: PluginConfigDb,
    deviceId: string,
    public schemas: JsonSchema[] = [],
    isPluginStorage: boolean,
    sensorId?: string,
    cameraId?: string,
  ) {
    this.#api = api;
    this.#proxy = proxy;
    this.#plugin = plugin;
    this.#pluginDb = pluginDb;
    this.#deviceId = deviceId;
    this.#isPluginStorage = isPluginStorage;
    this.#sensorId = sensorId;
    this.#cameraId = cameraId;

    if (this.#sensorId && this.#cameraId) {
      // Sensor storage: plugin + camera + sensor instance specific
      const sensorNs = NamespaceManager.pluginSensorNamespaces(this.#plugin.id, this.#cameraId, this.#sensorId);
      this.#storageNamespace = sensorNs.sensorStorageRpc;
    } else if (this.#isPluginStorage) {
      const pluginNs = NamespaceManager.pluginNamespaces(this.#plugin.id);
      this.#storageNamespace = pluginNs.pluginStorageRpc;
    } else {
      // Camera storage (per plugin + camera)
      const cameraNs = NamespaceManager.pluginCameraNamespaces(this.#plugin.id, this.#deviceId);
      this.#storageNamespace = cameraNs.cameraStorageRpc;
    }

    this.#api.setMaxListeners(this.#api.getMaxListeners() + 1);
    this.#api.once(API_EVENT.SHUTDOWN, this.#close.bind(this));
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
      const oldValue = objectPath.get(this.values, key);
      objectPath.set(this.values, key, newValue);
      await (schema as any).onSet?.(newValue, oldValue);

      if (this.#containsStorableSchema(schema)) {
        await this.save();
      }
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
    objectPath.set(this.values, key, value);
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
    const oldConfig = structuredClone(this.values);

    this.values = mergeWith(this.values, newConfig, (source: any, target: any) => {
      if (Array.isArray(source)) {
        return target;
      }
    });

    await this.#triggerOnSetForChanges(oldConfig, this.values);
    await this.save();
  }

  public defineSchemas(schemas: JsonSchema[]): void {
    this.schemas = schemas;
    this.#initializeStorage();
  }

  @RPCMethod
  public async addSchema(schema: JsonSchema): Promise<void> {
    let shouldSave = false;

    const schemaExist = this.hasSchema(schema.key);
    if (schemaExist) {
      throw new Error(`Schema with key ${schema.key} already exists`);
    } else {
      this.schemas.push(schema);
    }

    await this.#resolveOnGetFunctions(schema);

    if (this.#containsStorableSchema(schema)) {
      shouldSave = true;
    }

    if (shouldSave) {
      await this.save();
    }
  }

  @RPCMethod
  public async removeSchema(key: string): Promise<void> {
    const schema = this.schemas.find((schema) => schema.key === key);
    this.schemas = this.schemas.filter((schema) => schema.key !== key);
    objectPath.del(this.values, key);

    if (schema && this.#containsStorableSchema(schema)) {
      await this.save();
    }
  }

  @RPCMethod
  public async changeSchema(key: string, newSchema: Partial<JsonSchema>): Promise<void> {
    newSchema.key = key;
    const schema = this.schemas.find((schema) => schema.key === newSchema.key);

    if (schema) {
      mergeWith(schema, newSchema, (source: any, target: any) => {
        if (Array.isArray(source)) {
          return target;
        }
      });

      await this.#resolveOnGetFunctions(schema);

      if (this.#containsStorableSchema(schema)) {
        await this.save();
      }
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
    this.#api.removeListener(API_EVENT.SHUTDOWN, this.#close.bind(this));
    const config = this.#pluginDb.get('config') ?? {};
    delete config[this.#deviceId];
    this.values = {} as T;
    await this.#pluginDb.put('config', config);
  }

  public async save(): Promise<void> {
    const config = this.#pluginDb.get('config') ?? {};
    const storableConfig = this.schemas.length ? this.#filterStorableValues(this.schemas) : this.values;
    config[this.#deviceId] = storableConfig;
    await this.#pluginDb.put('config', config);
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

  async #triggerOnSetForChanges(oldConfig: Record<string, any>, newConfig: Record<string, any>): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const configKey in newConfig) {
      const oldValue = getValueByKey(oldConfig, configKey);
      const newValue = newConfig[configKey];

      if (!isEqual(oldValue, newValue, true)) {
        const schema = this.schemas.find((schema) => schema.key === configKey);
        if (schema && !isSubmitType(schema) && typeof schema.onSet === 'function') {
          promises.push(schema.onSet(newValue, oldValue));
        }
      }
    }

    await Promise.all(promises);
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

    // Preserve internal values (prefixed with '_') that have no schema.
    for (const [key, value] of Object.entries(this.values)) {
      if (key.startsWith('_')) {
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
    const deviceConfig = config[this.#deviceId] ?? {};
    const schemaConfig = generateConfigFromSchemas(this.schemas);

    this.values = mergeWith(schemaConfig, deviceConfig, (source: any, target: any) => {
      if (Array.isArray(source)) {
        return target;
      }

      if (target === undefined) {
        return source;
      }
    });
  }

  async #close(): Promise<void> {
    try {
      await this.save();
      await this.unregisterStorage();
    } catch {
      //
    }
  }
}
