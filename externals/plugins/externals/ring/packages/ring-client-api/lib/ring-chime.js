import { ChimeModel } from "./ring-types.js";
import { clientApi, deviceApi } from "./rest-client.js";
import { BehaviorSubject, Subject } from 'rxjs';
const settingsWhichRequireReboot = [
    'ding_audio_id',
    'ding_audio_user_id',
    'motion_audio_id',
    'motion_audio_user_id',
];
export class RingChime {
    id;
    deviceType;
    model;
    onData;
    onRequestUpdate = new Subject();
    initialData;
    restClient;
    constructor(initialData, restClient) {
        this.initialData = initialData;
        this.restClient = restClient;
        this.id = initialData.id;
        this.deviceType = initialData.kind;
        this.model = ChimeModel[this.deviceType] || 'Chime';
        this.onData = new BehaviorSubject(this.initialData);
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
    get description() {
        return this.data.description;
    }
    get volume() {
        return this.data.settings.volume;
    }
    getRingtones() {
        return this.restClient.request({
            url: clientApi('ringtones'),
        });
    }
    async getRingtoneByDescription(description, kind) {
        const ringtones = await this.getRingtones(), requestedRingtone = ringtones.audios.find((audio) => audio.available &&
            audio.description === description &&
            audio.kind === kind);
        if (!requestedRingtone) {
            throw new Error('Requested ringtone not found');
        }
        return requestedRingtone;
    }
    chimeUrl(path = '') {
        return clientApi(`chimes/${this.id}/${path}`);
    }
    playSound(kind) {
        return this.restClient.request({
            url: this.chimeUrl('play_sound'),
            method: 'POST',
            json: { kind },
        });
    }
    async snooze(time) {
        // time is in minutes, max 24 * 60 (1440)
        await this.restClient.request({
            url: this.chimeUrl('do_not_disturb'),
            method: 'POST',
            json: { time },
        });
        this.requestUpdate();
    }
    async clearSnooze() {
        await this.restClient.request({
            url: this.chimeUrl('do_not_disturb'),
            method: 'POST',
        });
        this.requestUpdate();
    }
    async updateChime(update) {
        await this.restClient.request({
            url: this.chimeUrl(),
            method: 'PUT',
            json: { chime: update },
        });
        this.requestUpdate();
        // inform caller if this change requires a reboot
        return Object.keys(update.settings || {}).some((key) => settingsWhichRequireReboot.includes(key));
    }
    setVolume(volume) {
        if (volume < 0 || volume > 11) {
            throw new Error(`Volume for ${this.name} must be between 0 and 11, got ${volume}`);
        }
        return this.updateChime({
            settings: {
                volume,
            },
        });
    }
    async getHealth() {
        const response = await this.restClient.request({
            url: clientApi(`chimes/${this.id}/health`),
        });
        return response.device_health;
    }
    async setNightlightEnabled(enabled) {
        await this.restClient.request({
            url: deviceApi(`devices/${this.id}/settings`),
            method: 'PATCH',
            json: {
                night_light_settings: {
                    light_sensor_enabled: enabled,
                },
            },
        });
        this.requestUpdate();
    }
}
