import { PushNotificationAction } from "./ring-types.js";
import { clientApi, commandsApi } from "./rest-client.js";
import { BehaviorSubject, Subject } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';
import { getBatteryLevel } from "./ring-camera.js";
import { logError } from "./util.js";
export class RingIntercom {
    id;
    deviceType;
    onData;
    onRequestUpdate = new Subject();
    onBatteryLevel;
    onDing = new Subject();
    onUnlocked = new Subject();
    initialData;
    restClient;
    constructor(initialData, restClient) {
        this.initialData = initialData;
        this.restClient = restClient;
        this.id = initialData.id;
        this.deviceType = initialData.kind;
        this.onData = new BehaviorSubject(this.initialData);
        this.onBatteryLevel = this.onData.pipe(map((data) => getBatteryLevel(data)), distinctUntilChanged());
        if (!initialData.subscribed) {
            this.subscribeToDingEvents().catch((e) => {
                logError('Failed to subscribe ' + initialData.description + ' to ding events');
                logError(e);
            });
        }
    }
    updateData(update) {
        this.onData.next(update);
    }
    requestUpdate() {
        this.onRequestUpdate.next(null);
    }
    get data() {
        return this.onData.getValue();
    }
    get name() {
        return this.data.description;
    }
    get isOffline() {
        return this.data.alerts.connection === 'offline';
    }
    get batteryLevel() {
        return getBatteryLevel(this.data);
    }
    unlock() {
        return this.restClient.request({
            method: 'PUT',
            url: commandsApi(`devices/${this.id}/device_rpc`),
            json: {
                command_name: 'device_rpc',
                request: {
                    jsonrpc: '2.0',
                    method: 'unlock_door',
                    params: {
                        door_id: 0,
                        user_id: 0,
                    },
                },
            },
        });
    }
    doorbotUrl(path = '') {
        return clientApi(`doorbots/${this.id}/${path}`);
    }
    subscribeToDingEvents() {
        return this.restClient.request({
            method: 'POST',
            url: this.doorbotUrl('subscribe'),
        });
    }
    unsubscribeFromDingEvents() {
        return this.restClient.request({
            method: 'POST',
            url: this.doorbotUrl('unsubscribe'),
        });
    }
    processPushNotification(notification) {
        if ('android_config' in notification &&
            notification.android_config.category ===
                PushNotificationAction.IntercomDing) {
            this.onDing.next();
        }
        else if ('gcmData' in notification.data &&
            notification.data.gcmData.action === PushNotificationAction.IntercomUnlock) {
            this.onUnlocked.next();
        }
    }
}
