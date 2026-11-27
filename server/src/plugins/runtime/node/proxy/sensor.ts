import { isEqual } from '@camera.ui/common/utils';
import { Subject } from '@camera.ui/sdk';
import { checkPropertyWrite } from '@camera.ui/sdk/internal';

import { NamespaceManager } from '../../../../rpc/namespaces.js';

import type { Promisify, RPCClient } from '@camera.ui/rpc';
import type { Observable, SensorDevice, SensorLike, SensorPropertySpec, SensorType } from '@camera.ui/sdk';
import type { PropertyChangedEvent, SensorDeviceState } from '@camera.ui/sdk/internal';
import type { SensorRefreshedState, StoredSensorData } from '../../../../rpc/interfaces/sensor.js';

export class SensorProxy implements SensorLike {
  readonly onPropertyChanged: Observable<{ property: string; value: unknown; timestamp: number }>;
  readonly onCapabilitiesChanged: Observable<string[]>;
  readonly onConnectedChanged: Observable<boolean>;
  readonly onAssignmentChanged: Observable<readonly string[]>;
  readonly onDeviceInfoChanged: Observable<SensorDevice | undefined>;
  readonly onPropertySpecsChanged: Observable<Readonly<Record<string, SensorPropertySpec>>>;

  readonly #propertyChangedSubject = new Subject<{ property: string; value: unknown; timestamp: number }>();
  readonly #capabilitiesChangedSubject = new Subject<string[]>();
  readonly #connectedChangedSubject = new Subject<boolean>();
  readonly #assignmentChangedSubject = new Subject<readonly string[]>();
  readonly #deviceInfoChangedSubject = new Subject<SensorDevice | undefined>();
  readonly #propertySpecsChangedSubject = new Subject<Readonly<Record<string, SensorPropertySpec>>>();

  private _id: string;
  private _type: SensorType;
  private _name: string;
  private _displayName: string;
  private _shortName: string;
  private _device?: SensorDevice;
  private _primary: boolean;
  private _nativeId?: string;
  private _ownerId: string;
  private _assignedCameraIds: string[];
  private _assignmentLocked: boolean;
  private _exposed: boolean;
  private _connected: boolean;
  private _proxy: RPCClient;
  private _properties = new Map<string, unknown>();
  private _capabilities: string[] = [];
  private _propertySpecs: Readonly<Record<string, SensorPropertySpec>>;
  private _rpcProxy: Promisify<SensorLike>;
  private _eventSubscription?: () => void;
  private _eventCounts = new Map<string, number>();

  constructor(data: StoredSensorData, proxy: RPCClient, ownerNamespace: string) {
    this._id = data.id;
    this._type = data.type;
    this._name = data.name;
    this._displayName = data.displayName ?? data.name;
    this._shortName = data.shortName;
    this._device = data.device;
    this._primary = data.primary;
    this._nativeId = data.nativeId;
    this._ownerId = data.pluginId;
    this._assignedCameraIds = [...data.assignedCameraIds];
    this._assignmentLocked = data.boundCameraId !== undefined;
    this._exposed = data.exposed;
    this._connected = data.connected;
    this._proxy = proxy;
    this._capabilities = data.capabilities ?? [];
    this._propertySpecs = data.propertySpecs ?? {};

    this.onPropertyChanged = this.#propertyChangedSubject.asObservable();
    this.onCapabilitiesChanged = this.#capabilitiesChangedSubject.asObservable();
    this.onConnectedChanged = this.#connectedChangedSubject.asObservable();
    this.onAssignmentChanged = this.#assignmentChangedSubject.asObservable();
    this.onDeviceInfoChanged = this.#deviceInfoChangedSubject.asObservable();
    this.onPropertySpecsChanged = this.#propertySpecsChangedSubject.asObservable();

    this._rpcProxy = proxy.createProxy<SensorLike>(ownerNamespace);

    for (const [key, value] of Object.entries(data.properties)) {
      this._properties.set(key, value);
    }
  }

  public get id(): string {
    return this._id;
  }

  public get type(): SensorType {
    return this._type;
  }

  public get name(): string {
    return this._name;
  }

  public get displayName(): string {
    return this._displayName;
  }

  public get shortName(): string {
    return this._shortName;
  }

  public get deviceInfo(): SensorDevice | undefined {
    return this._device;
  }

  public get primary(): boolean {
    return this._primary;
  }

  public get pluginId(): string | undefined {
    return this._ownerId;
  }

  public get nativeId(): string | undefined {
    return this._nativeId;
  }

  public get assignedCameraIds(): readonly string[] {
    return this._assignedCameraIds;
  }

  public get assignmentLocked(): boolean {
    return this._assignmentLocked;
  }

  public get connected(): boolean {
    return this._connected;
  }

  get exposed(): boolean {
    return this._exposed;
  }

  public get capabilities(): string[] {
    return this._capabilities;
  }

  public get propertySpecs(): Readonly<Record<string, SensorPropertySpec>> {
    return this._propertySpecs;
  }

  public setDisplayName(value: string): void {
    this._displayName = value;
  }

  public hasCapability(capability: string): boolean {
    return this._capabilities.includes(capability);
  }

  public getValue(property: string): unknown {
    return this._properties.get(property);
  }

  public getValues(): Readonly<Record<string, unknown>> {
    return Object.fromEntries(this._properties);
  }

  async updateValue(property: string, value: unknown): Promise<void> {
    await this._rpcProxy.updateValue(property, checkPropertyWrite(this._propertySpecs, property, value));
  }

  public _updateCachedValue(property: string, value: unknown, timestamp?: number): void {
    if (isEqual(this._properties.get(property), value, true)) return;
    this._properties.set(property, value);
    this.#propertyChangedSubject.next({ property, value, timestamp: timestamp ?? Date.now() });
  }

  public _eventMarks(): Map<string, number> {
    return new Map(this._eventCounts);
  }

  public _applyRefreshedState(state: SensorRefreshedState, marks?: Map<string, number>): void {
    const current = (key: string): boolean => !marks || this._eventCounts.get(key) === marks.get(key);

    if (state.displayName && current('displayName')) {
      this.setDisplayName(state.displayName);
    }

    if (state.deviceState && current('device')) {
      this._applyDeviceState(state.deviceState);
    }

    if (current('capabilities') && !isEqual(this._capabilities, state.capabilities, true)) {
      this._updateCapabilities(state.capabilities);
    }

    if (state.propertySpecs && current('propertySpecs')) {
      this._applyPropertySpecs(state.propertySpecs);
    }

    for (const [property, value] of Object.entries(state.properties)) {
      if (current(`property:${property}`)) this._updateCachedValue(property, value);
    }
  }

  public _setDisplayName(displayName: string): void {
    this.setDisplayName(displayName);
  }

  public _applyDeviceEvent(state: SensorDeviceState): void {
    this._countEvent('device');
    this._countEvent('displayName');
    this._applyDeviceState(state);
  }

  public _applyDeviceState(state: SensorDeviceState): void {
    const changed =
      !isEqual(this._device, state.device) || this._shortName !== state.shortName || this._primary !== state.primary || this._displayName !== state.displayName;
    this._device = state.device;
    this._displayName = state.displayName;
    this._shortName = state.shortName;
    this._primary = state.primary;
    if (changed) this.#deviceInfoChangedSubject.next(state.device);
  }

  public _applyPropertySpecsEvent(specs: Record<string, SensorPropertySpec>): void {
    this._countEvent('propertySpecs');
    this._applyPropertySpecs(specs);
  }

  public _applyPropertySpecs(specs: Record<string, SensorPropertySpec>): void {
    if (isEqual(this._propertySpecs, specs)) return;
    this._propertySpecs = specs;
    this.#propertySpecsChangedSubject.next(specs);
  }

  public _updateCapabilities(capabilities: string[]): void {
    this._capabilities = capabilities;
    this.#capabilitiesChangedSubject.next(capabilities);
  }

  public _setConnected(connected: boolean): void {
    if (this._connected === connected) return;
    this._connected = connected;
    this.#connectedChangedSubject.next(connected);
  }

  _setAssignedCameras(cameraIds: string[]): void {
    this._assignedCameraIds = [...cameraIds];
    this.#assignmentChangedSubject.next(this._assignedCameraIds);
  }

  public _setExposed(exposed: boolean): void {
    this._exposed = exposed;
  }

  public async _subscribeToEvents(): Promise<void> {
    if (this._eventSubscription) return;

    const namespace = NamespaceManager.sensorEventNamespaces(this.id);
    this._eventSubscription = await this._proxy.subscribe<{ type: string; data: unknown }>(namespace.sensorSubject, (event) => {
      this._handleSensorEvent(event);
    });
  }

  public _unsubscribeFromEvents(): void {
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
      shortName: this._shortName,
      device: this._device,
      primary: this._primary,
      nativeId: this._nativeId,
      pluginId: this._ownerId,
      assignedCameraIds: [...this._assignedCameraIds],
      exposed: this._exposed,
      connected: this._connected,
      properties: this.getValues(),
      capabilities: this._capabilities,
      propertySpecs: { ...this._propertySpecs },
    };
  }

  get isAvailable(): boolean {
    return this._id !== '';
  }
}
