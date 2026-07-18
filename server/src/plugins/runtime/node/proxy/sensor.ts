import { Subject } from '@camera.ui/sdk';

import { computeSensorGlobalId, computeSensorStableId } from '../../../../camera/sensors/stable-id.js';
import { NamespaceManager } from '../../../../rpc/namespaces.js';

import type { Promisify, RPCClient } from '@camera.ui/rpc';
import type { Observable, SensorLike, SensorType } from '@camera.ui/sdk';
import type { PropertyChangedEvent } from '@camera.ui/sdk/internal';
import type { SensorRefreshedState, StoredSensorData } from '../../../../rpc/interfaces/sensor.js';

// Cross-process consumer proxy: caches sensor state from broadcasts, forwards Control writes via RPC.
export class SensorProxy implements SensorLike {
  readonly onPropertyChanged: Observable<{ property: string; value: unknown; timestamp: number }>;
  readonly onCapabilitiesChanged: Observable<string[]>;

  readonly #propertyChangedSubject = new Subject<{ property: string; value: unknown; timestamp: number }>();
  readonly #capabilitiesChangedSubject = new Subject<string[]>();

  private _id: string;
  private _type: SensorType;
  private _name: string;
  private _displayName: string;
  private _ownerId: string;
  private _cameraId: string;
  private _proxy: RPCClient;
  private _properties = new Map<string, unknown>();
  private _capabilities: string[] = [];
  private _rpcProxy: Promisify<SensorLike>;
  private _eventSubscription?: () => void;

  constructor(data: StoredSensorData, proxy: RPCClient, ownerNamespace: string, cameraId: string) {
    this._id = data.id;
    this._type = data.type;
    this._name = data.name;
    this._displayName = data.displayName ?? data.name;
    this._ownerId = data.pluginId;
    this._cameraId = cameraId;
    this._proxy = proxy;
    this._capabilities = data.capabilities ?? [];

    this.onPropertyChanged = this.#propertyChangedSubject.asObservable();
    this.onCapabilitiesChanged = this.#capabilitiesChangedSubject.asObservable();

    // RPC directly to owner - for Control sensors
    this._rpcProxy = proxy.createProxy<SensorLike>(ownerNamespace);

    for (const [key, value] of Object.entries(data.properties)) {
      this._properties.set(key, value);
    }
  }

  get id(): string {
    return this._id;
  }

  get type(): SensorType {
    return this._type;
  }

  get name(): string {
    return this._name;
  }

  get displayName(): string {
    return this._displayName;
  }

  setDisplayName(value: string): void {
    this._displayName = value;
  }

  get pluginId(): string | undefined {
    return this._ownerId;
  }

  get capabilities(): string[] {
    return this._capabilities;
  }

  hasCapability(capability: string): boolean {
    return this._capabilities.includes(capability);
  }

  getValue(property: string): unknown {
    return this._properties.get(property);
  }

  getValues(): Readonly<Record<string, unknown>> {
    return Object.fromEntries(this._properties);
  }

  // Forwards to the owning sensor's `updateValue` via RPC. On the owning side
  // the dispatch lands on the sensor instance — for control sensors that override
  // `updateValue` (Light, Switch, Siren, Lock, Garage, SecuritySystem, PTZ), the
  // call routes through the appropriate semantic method (`setOn`, `setActive`, etc.)
  // so plugin overrides drive hardware and state stays consistent.
  async updateValue(property: string, value: unknown): Promise<void> {
    await this._rpcProxy.updateValue(property, value);
  }

  _updateCachedValue(property: string, value: unknown, timestamp?: number): void {
    this._properties.set(property, value);
    this.#propertyChangedSubject.next({ property, value, timestamp: timestamp ?? Date.now() });
  }

  _applyRefreshedState(state: SensorRefreshedState): void {
    this._capabilities = state.capabilities;
    if (state.displayName) {
      this.setDisplayName(state.displayName);
    }

    for (const [key, value] of Object.entries(state.properties)) {
      this._updateCachedValue(key, value);
    }
  }

  _setDisplayName(displayName: string): void {
    this.setDisplayName(displayName);
  }

  _updateCapabilities(capabilities: string[]): void {
    this._capabilities = capabilities;
    this.#capabilitiesChangedSubject.next(capabilities);
  }

  _subscribeToEvents(): void {
    if (this._eventSubscription) return;

    const namespace = NamespaceManager.sensorEventNamespaces(this._cameraId, this.id);
    this._proxy
      .subscribe<{ type: string; data: unknown }>(namespace.sensorSubject, (event) => {
        this._handleSensorEvent(event);
      })
      .then((unsubscribe) => {
        this._eventSubscription = unsubscribe;
      });
  }

  _unsubscribeFromEvents(): void {
    if (this._eventSubscription) {
      this._eventSubscription();
      this._eventSubscription = undefined;
    }
  }

  private _handleSensorEvent(event: { type: string; data: unknown }): void {
    switch (event.type) {
      case 'property:changed': {
        const changeEvent = event.data as PropertyChangedEvent;
        this._updateCachedValue(changeEvent.property, changeEvent.value, changeEvent.timestamp);
        break;
      }
      case 'sensor:capabilities:changed': {
        const capsEvent = event.data as { sensorId: string; capabilities: string[] };
        this._updateCapabilities(capsEvent.capabilities);
        break;
      }
      case 'sensor:displayName:changed': {
        const displayNameEvent = event.data as { sensorId: string; displayName: string };
        this._setDisplayName(displayNameEvent.displayName);
        break;
      }
    }
  }

  toStoredData(): StoredSensorData {
    const stableId = computeSensorStableId(this._ownerId, this.type, this.name);

    return {
      id: this.id,
      stableId,
      globalId: computeSensorGlobalId(this._cameraId, stableId),
      type: this.type,
      name: this.name,
      displayName: this.displayName,
      pluginId: this._ownerId,
      properties: this.getValues(),
      capabilities: this._capabilities,
    };
  }

  get isAvailable(): boolean {
    return this._id !== '';
  }
}
