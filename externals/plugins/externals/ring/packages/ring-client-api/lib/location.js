import { WebSocket } from 'undici';
import { BehaviorSubject, firstValueFrom, merge, ReplaySubject, Subject, } from 'rxjs';
import { concatMap, debounceTime, distinctUntilChanged, filter, map, scan, shareReplay, skip, } from 'rxjs/operators';
import { delay, generateUuid, logDebug, logError, logInfo } from "./util.js";
import { DispatchSignalType, RingDeviceType, disabledLocationModes, isWebSocketSupportedAsset, } from "./ring-types.js";
import { appApi, clientApi } from "./rest-client.js";
import { getSearchQueryString } from "./ring-camera.js";
import { RingDevice } from "./ring-device.js";
import { Subscribed } from "./subscribed.js";
const deviceListMessageType = 'DeviceInfoDocGetList';
function flattenDeviceData(data) {
    return Object.assign({}, data.general && data.general.v2, data.device && data.device.v1);
}
export class Location extends Subscribed {
    seq = 1;
    onMessage = new Subject();
    onDataUpdate = new Subject();
    onDeviceDataUpdate = this.onDataUpdate.pipe(filter((message) => {
        return message.datatype === 'DeviceInfoDocType' && Boolean(message.body);
    }), concatMap((message) => message.body), map(flattenDeviceData));
    onDeviceList = this.onMessage.pipe(filter((m) => m.msg === deviceListMessageType));
    onDevices = this.onDeviceList.pipe(scan((devices, { body: deviceList, src }) => {
        if (!deviceList) {
            return devices;
        }
        if (!this.receivedAssetDeviceLists.includes(src)) {
            this.receivedAssetDeviceLists.push(src);
        }
        return deviceList.reduce((updatedDevices, data) => {
            const flatData = flattenDeviceData(data), existingDevice = updatedDevices.find((x) => x.zid === flatData.zid);
            if (existingDevice) {
                existingDevice.updateData(flatData);
                return updatedDevices;
            }
            return [...updatedDevices, new RingDevice(flatData, this, src)];
        }, devices);
    }, []), distinctUntilChanged((a, b) => a.length === b.length), filter(() => {
        return Boolean(this.assets &&
            this.assets.every((asset) => this.receivedAssetDeviceLists.includes(asset.uuid)));
    }), shareReplay(1));
    onSessionInfo = this.onDataUpdate.pipe(filter((m) => m.msg === 'SessionInfo'), map((m) => m.body));
    onConnected = new BehaviorSubject(false);
    onLocationMode = new ReplaySubject(1);
    onLocationModeRequested = new Subject();
    reconnecting = false;
    disconnected = false;
    connectionPromise;
    securityPanel;
    assets;
    receivedAssetDeviceLists = [];
    offlineAssets = [];
    hasHubs;
    hasAlarmBaseStation;
    locationDetails;
    cameras;
    chimes;
    intercoms;
    options;
    restClient;
    constructor(locationDetails, cameras, chimes, intercoms, options, restClient) {
        super();
        this.locationDetails = locationDetails;
        this.cameras = cameras;
        this.chimes = chimes;
        this.intercoms = intercoms;
        this.options = options;
        this.restClient = restClient;
        this.hasHubs = this.options.hasHubs;
        this.hasAlarmBaseStation = this.options.hasAlarmBaseStation;
        this.addSubscriptions(
        // start listening for devices immediately
        this.onDevices.subscribe(), 
        // watch for sessions to come online
        this.onSessionInfo.subscribe((sessions) => {
            sessions.forEach(({ connectionStatus, assetUuid }) => {
                const assetWasOffline = this.offlineAssets.includes(assetUuid), asset = this.assets && this.assets.find((x) => x.uuid === assetUuid);
                if (!asset) {
                    // we don't know about this asset, so don't worry about it
                    return;
                }
                if (connectionStatus === 'online') {
                    if (assetWasOffline) {
                        this.requestList(deviceListMessageType, assetUuid).catch(() => { });
                        this.offlineAssets = this.offlineAssets.filter((id) => id !== assetUuid);
                        logInfo(`Ring ${asset.kind} ${assetUuid} has come back online`);
                    }
                }
                else if (!assetWasOffline) {
                    logError(`Ring ${asset.kind} ${assetUuid} is offline or on cellular backup.  Waiting for status to change`);
                    this.offlineAssets.push(assetUuid);
                }
            });
        }));
        if (!options.hasAlarmBaseStation && options.locationModePollingSeconds) {
            this.addSubscriptions(merge(this.onLocationModeRequested, this.onLocationMode)
                .pipe(debounceTime(options.locationModePollingSeconds * 1000))
                .subscribe(() => this.getLocationMode()));
            this.getLocationMode().catch(logError);
        }
    }
    get id() {
        return this.locationId;
    }
    get locationId() {
        return this.locationDetails.location_id;
    }
    get name() {
        return this.locationDetails.name;
    }
    async createConnection() {
        if (this.disconnected) {
            return Promise.resolve({ disconnected: true });
        }
        logInfo('Creating location socket.io connection - ' + this.name);
        if (process.version.startsWith('v15.')) {
            logError('Node 15 is not currently supported by the Ring client. Please install the latest Node 14 instead. May not be able to fetch devices from Ring Alarm and Smart Lighting Hubs on this version of node.');
        }
        const { assets, ticket, host } = await this.restClient.request({
            url: appApi(`clap/tickets?locationID=${this.id}&enableExtendedEmergencyCellUsage=true&requestedTransport=ws`),
        }), supportedAssets = assets.filter(isWebSocketSupportedAsset);
        this.assets = supportedAssets;
        this.receivedAssetDeviceLists.length = 0;
        this.offlineAssets.length = 0;
        if (!supportedAssets.length) {
            const errorMessage = `No assets (alarm hubs or beam bridges) found for location ${this.name} - ${this.id}`;
            logError(errorMessage);
            throw new Error(errorMessage);
        }
        const url = `wss://${host}/ws?authcode=${ticket}&ack=false`, socket = new WebSocket(url), reconnect = () => {
            if (this.reconnecting && this.connectionPromise) {
                return this.connectionPromise;
            }
            this.onConnected.next(false);
            if (!this.disconnected) {
                logInfo('Reconnecting location socket.io connection');
            }
            this.reconnecting = true;
            socket.close();
            return (this.connectionPromise = delay(1000).then(() => {
                return this.createConnection();
            }));
        };
        socket.addEventListener('message', (event) => {
            try {
                const { msg: message, channel } = JSON.parse(event.data);
                this.onMessage.next(message);
                if (message.datatype === 'HubDisconnectionEventType') {
                    logInfo('Location connection told to reconnect');
                    return reconnect();
                }
                if (channel === 'DataUpdate') {
                    this.onDataUpdate.next(message);
                }
            }
            catch (e) {
                logError('Error parsing message from server: ' + event.data);
            }
        });
        socket.addEventListener('error', (error) => {
            logDebug('WebSocket error: ' + error);
            return reconnect();
        });
        socket.addEventListener('close', (event) => {
            logDebug(`WebSocket connection closed: ${event.code}, ${event.reason}`);
            return reconnect();
        });
        this.reconnecting = false;
        return new Promise((resolve, reject) => {
            socket.addEventListener('open', () => {
                resolve(socket);
                this.onConnected.next(true);
                logInfo('Ring connected to socket.io server');
                assets.forEach((asset) => this.requestList(deviceListMessageType, asset.uuid));
            }, { once: true });
            socket.addEventListener('error', reject, { once: true });
        }).catch(reconnect);
    }
    getConnection() {
        if (!this.hasHubs) {
            return Promise.reject(new Error(`Location ${this.name} does not have any hubs`));
        }
        if (this.connectionPromise) {
            return this.connectionPromise;
        }
        return (this.connectionPromise = this.createConnection());
    }
    async sendMessage(message) {
        const connection = await this.getConnection();
        message.seq = this.seq++;
        connection.send(JSON.stringify({
            channel: 'message',
            msg: message,
        }));
    }
    async sendCommandToSecurityPanel(commandType, data) {
        const securityPanel = await this.getSecurityPanel();
        securityPanel.sendCommand(commandType, data);
    }
    async setAlarmMode(alarmMode, bypassSensorZids) {
        const securityPanel = await this.getSecurityPanel(), updatedDataPromise = firstValueFrom(securityPanel.onData.pipe(skip(1)));
        await this.sendCommandToSecurityPanel('security-panel.switch-mode', {
            mode: alarmMode,
            bypass: bypassSensorZids,
        });
        const updatedData = await updatedDataPromise;
        if (updatedData.mode !== alarmMode) {
            throw new Error(`Failed to set alarm mode to "${alarmMode}".  Sensors may require bypass, which can only be done in the Ring app.`);
        }
    }
    async getAlarmMode() {
        const securityPanel = await this.getSecurityPanel();
        return securityPanel.data.mode;
    }
    soundSiren() {
        return this.sendCommandToSecurityPanel('security-panel.sound-siren');
    }
    silenceSiren() {
        return this.sendCommandToSecurityPanel('security-panel.silence-siren');
    }
    setLightGroup(groupId, on, durationSeconds = 60) {
        return this.restClient.request({
            method: 'POST',
            url: `https://api.ring.com/groups/v1/locations/${this.id}/groups/${groupId}/devices`,
            json: {
                lights_on: {
                    duration_seconds: durationSeconds,
                    enabled: on,
                },
            },
        });
    }
    getNextMessageOfType(type, src) {
        return firstValueFrom(this.onMessage.pipe(filter((m) => m.msg === type && m.src === src), map((m) => m.body)));
    }
    requestList(listType, assetId) {
        return this.sendMessage({ msg: listType, dst: assetId });
    }
    async getList(listType, assetId) {
        await this.requestList(listType, assetId);
        return this.getNextMessageOfType(listType, assetId);
    }
    async getDevices() {
        if (!this.hasHubs) {
            return Promise.resolve([]);
        }
        if (!this.connectionPromise) {
            await this.getConnection();
        }
        return firstValueFrom(this.onDevices);
    }
    getRoomList(assetId) {
        return this.getList('RoomGetList', assetId);
    }
    async getSecurityPanel() {
        if (this.securityPanel) {
            return this.securityPanel;
        }
        const devices = await this.getDevices(), securityPanel = devices.find((device) => {
            return device.data.deviceType === RingDeviceType.SecurityPanel;
        });
        if (!securityPanel) {
            throw new Error(`Could not find a security panel for location ${this.name} - ${this.id}`);
        }
        return (this.securityPanel = securityPanel);
    }
    disarm() {
        return this.setAlarmMode('none');
    }
    armHome(bypassSensorZids) {
        return this.setAlarmMode('some', bypassSensorZids);
    }
    armAway(bypassSensorZids) {
        return this.setAlarmMode('all', bypassSensorZids);
    }
    getHistory(options = {}) {
        options.maxLevel = options.maxLevel || 50;
        return this.restClient.request({
            url: appApi(`rs/history${getSearchQueryString({
                accountId: this.id,
                ...options,
            })}`),
        });
    }
    getCameraEvents(options = {}) {
        return this.restClient.request({
            url: clientApi(`locations/${this.id}/events${getSearchQueryString(options)}`),
        });
    }
    getAccountMonitoringStatus() {
        return this.restClient.request({
            url: appApi('rs/monitoring/accounts/' + this.id),
        });
    }
    triggerAlarm(signalType) {
        const now = Date.now(), alarmSessionUuid = generateUuid(), baseStationAsset = this.assets && this.assets.find((x) => x.kind === 'base_station_v1');
        if (!baseStationAsset) {
            throw new Error('Cannot dispatch panic events without an alarm base station');
        }
        return this.restClient.request({
            method: 'POST',
            url: appApi(`rs/monitoring/accounts/${this.id}/assets/${baseStationAsset.uuid}/userAlarm`),
            json: {
                alarmSessionUuid,
                currentTsMs: now,
                eventOccurredTime: now,
                signalType,
            },
        });
    }
    triggerBurglarAlarm() {
        return this.triggerAlarm(DispatchSignalType.Burglar);
    }
    triggerFireAlarm() {
        return this.triggerAlarm(DispatchSignalType.Fire);
    }
    async getLocationMode() {
        this.onLocationModeRequested.next(null);
        const response = await this.restClient.request({
            method: 'GET',
            url: appApi(`mode/location/${this.id}`),
        });
        this.onLocationMode.next(response.mode);
        return response;
    }
    async setLocationMode(mode) {
        const response = await this.restClient.request({
            method: 'POST',
            url: appApi(`mode/location/${this.id}`),
            json: { mode },
        });
        this.onLocationMode.next(response.mode);
        return response;
    }
    async disableLocationModes() {
        await this.restClient.request({
            method: 'DELETE',
            url: appApi(`mode/location/${this.id}/settings`),
        });
        this.onLocationMode.next('disabled');
    }
    async enableLocationModes() {
        const response = await this.restClient.request({
            method: 'POST',
            url: appApi(`mode/location/${this.id}/settings/setup`),
        });
        await this.getLocationMode();
        return response;
    }
    getLocationModeSettings() {
        return this.restClient.request({
            method: 'GET',
            url: appApi(`mode/location/${this.id}/settings`),
        });
    }
    setLocationModeSettings(settings) {
        return this.restClient.request({
            method: 'POST',
            url: appApi(`mode/location/${this.id}/settings`),
            json: settings,
        });
    }
    getLocationModeSharing() {
        return this.restClient.request({
            method: 'GET',
            url: appApi(`mode/location/${this.id}/sharing`),
        });
    }
    setLocationModeSharing(sharedUsersEnabled) {
        return this.restClient.request({
            method: 'POST',
            url: appApi(`mode/location/${this.id}/sharing`),
            json: { sharedUsersEnabled },
        });
    }
    async supportsLocationModeSwitching() {
        if (this.hasAlarmBaseStation || !this.cameras.length) {
            return false;
        }
        const modeResponse = await this.getLocationMode(), { mode, readOnly } = modeResponse;
        logDebug('Location Mode: ' + JSON.stringify(modeResponse));
        return !readOnly && !disabledLocationModes.includes(mode);
    }
    disconnect() {
        this.disconnected = true;
        this.unsubscribe();
        this.cameras.forEach((camera) => camera.disconnect());
        this.getDevices()
            .then((devices) => {
            devices.forEach((device) => device.disconnect());
        })
            .catch(logError);
        if (this.connectionPromise) {
            this.connectionPromise
                .then((connection) => connection.close())
                .catch(logError);
        }
    }
}
