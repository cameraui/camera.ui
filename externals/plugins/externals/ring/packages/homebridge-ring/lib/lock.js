import { BaseDeviceAccessory } from "./base-device-accessory.js";
import { distinctUntilChanged } from 'rxjs/operators';
import { hap } from "./hap.js";
function getCurrentState({ locked }) {
    const { Characteristic: { LockCurrentState: State }, } = hap;
    switch (locked) {
        case 'unlocked':
            return State.UNSECURED;
        case 'locked':
            return State.SECURED;
        case 'jammed':
            return State.JAMMED;
        default:
            return State.UNKNOWN;
    }
}
export class Lock extends BaseDeviceAccessory {
    targetState;
    device;
    accessory;
    config;
    constructor(device, accessory, config) {
        super();
        this.device = device;
        this.accessory = accessory;
        this.config = config;
        const { Characteristic, Service } = hap;
        this.device.onData
            .pipe(distinctUntilChanged((a, b) => a.locked === b.locked))
            .subscribe((data) => {
            this.targetState = this.getTargetState(data);
        });
        this.registerCharacteristic({
            characteristicType: Characteristic.LockCurrentState,
            serviceType: Service.LockMechanism,
            getValue: (data) => {
                const state = getCurrentState(data);
                if (state === this.targetState) {
                    this.targetState = undefined;
                }
                return state;
            },
        });
        this.registerCharacteristic({
            characteristicType: Characteristic.LockTargetState,
            serviceType: Service.LockMechanism,
            getValue: (data) => this.getTargetState(data),
            setValue: (value) => this.setTargetState(value),
        });
    }
    setTargetState(state) {
        const { Characteristic: { LockTargetState: State }, } = hap, command = state === State.SECURED ? 'lock' : 'unlock';
        this.targetState =
            state === getCurrentState(this.device.data) ? undefined : state;
        return this.device.sendCommand(`lock.${command}`);
    }
    getTargetState(data) {
        return this.targetState || getCurrentState(data);
    }
}
