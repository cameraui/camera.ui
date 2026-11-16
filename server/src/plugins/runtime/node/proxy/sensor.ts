import { isEqual } from '@camera.ui/common/utils';
import { Subject } from '@camera.ui/sdk';

import { NamespaceManager } from '../../../../rpc/namespaces.js';

import type { Promisify, RPCClient } from '@camera.ui/rpc';
import type { Observable, SensorLike, SensorType } from '@camera.ui/sdk';
import type { PropertyChangedEvent } from '@camera.ui/sdk/internal';
import type { SensorRefreshedState, StoredSensorData } from '../../../../rpc/interfaces/sensor.js';

export class SensorProxy implements SensorLike {
  readonly onPropertyChanged: Observable<{ property: string; value: unknown; timestamp: number }>;
  readonly onCapabilitiesChanged: Observable<string[]>;
  readonly onConnectedChanged: Observable<boolean>;
  readonly onAssignmentChanged: Observable<readonly string[]>;

  readonly #propertyChangedSubject = new Subject<{ property: string; value: unknown; timestamp: number }>();
  readonly #capabilitiesChangedSubject = new Subject<string[]>();
  readonly #connectedChangedSubject = new Subject<boolean>();
  readonly #assignmentChangedSubject = new Subject<readonly string[]>();

  private _id: string;
  private _type: SensorType;
  private _name: string;
  private _displayName: string;
  private _nativeId?: string;
  private _ownerId: string;
  private _assignedCameraIds: string[];
  private _assignmentLocked: boolean;
  private _exposed: boolean;
  private _connected: boolean;
  private _proxy: RPCClient;
  private _properties = new Map<string, unknown>();
  private _capabilities: string[] = [];
  private _rpcProxy: Promisify<SensorLike>;
  private _eventSubscription?: () => void;
  private _eventCounts = new Map<string, number>();

  constructor(data: StoredSensorData, proxy: RPCClient, ownerNamespace: string) {
    this._id = data.id;
    this._type = data.type;
    this._name = data.name;
    this._displayName = data.displayName ?? data.name;
    this._nativeId = data.nativeId;
    this._ownerId = data.pluginId;
    this._assignedCameraIds = [...data.assignedCameraIds];
    this._assignmentLocked = data.boundCameraId !== undefined;
    this._exposed = data.exposed;
    this._connected = data.connected;
    this._proxy = proxy;
    this._capabilities = data.capabilities ?? [];

    this.onPropertyChanged = this.#propertyChangedSubject.asObservable();
    this.onCapabilitiesChanged = this.#capabilitiesChangedSubject.asObservable();
    this.onConnectedChanged = this.#connectedChangedSubject.asObservable();
    this.onAssignmentChanged = this.#assignmentChangedSubject.asObservable();

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

  get pluginId(): string | undefined {
    return this._ownerId;
  }

  get nativeId(): string | undefined {
    return this._nativeId;
  }

  get assignedCameraIds(): readonly string[] {
    return this._assignedCameraIds;
  }

  get assignmentLocked(): boolean {
    return this._assignmentLocked;
  }

  get connected(): boolean {
    return this._connected;
  }

  get exposed(): boolean {
    return this._exposed;
  }

  get capabilities(): string[] {
    return this._capabilities;
  }

  setDisplayName(value: string): void {
    this._displayName = value;
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

  async updateValue(property: string, value: unknown): Promise<void> {
    await this._rpcProxy.updateValue(property, value);
  }

  _updateCachedValue(property: string, value: unknown, timestamp?: number): void {
    if (isEqual(this._properties.get(property), value, true)) return;
    this._properties.set(property, value);
    this.#propertyChangedSubject.next({ property, value, timestamp: timestamp ?? Date.now() });
  }

  _eventMarks(): Map<string, number> {
    return new Map(this._eventCounts);
  }

  _applyRefreshedState(state: SensorRefreshedState, marks?: Map<string, number>): void {
    const current = (key: string): boolean => !marks || this._eventCounts.get(key) === marks.get(key);

    if (state.displayName && current('displayName')) {
      this.setDisplayName(state.displayName);
    }

    if (current('capabilities') && !isEqual(this._capabilities, state.capabilities, true)) {
      this._updateCapabilities(state.capabilities);
    }

    for (const [property, value] of Object.entries(state.properties)) {
      if (current(`property:${property}`)) this._updateCachedValue(property, value);
    }
  }

  _setDisplayName(displayName: string): void {
    this.setDisplayName(displayName);
  }

  _updateCapabilities(capabilities: string[]): void {
    this._capabilities = capabilities;
    this.#capabilitiesChangedSubject.next(capabilities);
  }

  _setConnected(connected: boolean): void {
    if (this._connected === connected) return;
    this._connected = connected;
    this.#connectedChangedSubject.next(connected);
  }

  _setAssignedCameras(cameraIds: string[]): void {
    this._assignedCameraIds = [...cameraIds];
    this.#assignmentChangedSubject.next(this._assignedCameraIds);
  }

  _setExposed(exposed: boolean): void {
    this._exposed = exposed;
  }

  async _subscribeToEvents(): Promise<void> {
    if (this._eventSubscription) return;

    const namespace = NamespaceManager.sensorEventNamespaces(this.id);
    this._eventSubscription = await this._proxy.subscribe<{ type: string; data: unknown }>(namespace.sensorSubject, (event) => {
      this._handleSensorEvent(event);
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
        this._countEvent(`property:${changeEvent.property}`);
        this._updateCachedValue(changeEvent.property, changeEvent.value, changeEvent.timestamp);
        break;
      }
      case 'sensor:capabilities:changed': {
        const capsEvent = event.data as { sensorId: string; capabilities: string[] };
        this._countEvent('capabilities');
        this._updateCapabilities(capsEvent.capabilities);
        break;
      }
      case 'sensor:displayName:changed': {
        const displayNameEvent = event.data as { sensorId: string; displayName: string };
        this._countEvent('displayName');
        this._setDisplayName(displayNameEvent.displayName);
        break;
      }
    }
  }

  private _countEvent(key: string): void {
    this._eventCounts.set(key, (this._eventCounts.get(key) ?? 0) + 1);
  }

  toStoredData(): StoredSensorData {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      displayName: this.displayName,
      nativeId: this._nativeId,
      pluginId: this._ownerId,
      assignedCameraIds: [...this._assignedCameraIds],
      exposed: this._exposed,
      connected: this._connected,
      properties: this.getValues(),
      capabilities: this._capabilities,
    };
  }

  get isAvailable(): boolean {
    return this._id !== '';
  }
}
