import { BaseDeviceAccessory } from "./base-device-accessory.js";
import { hap } from "./hap.js";
import { logInfo } from 'ring-client-api/util';
export class UnknownZWaveSwitchSwitch extends BaseDeviceAccessory {
    device;
    accessory;
    config;
    constructor(device, accessory, config) {
        super();
        this.device = device;
        this.accessory = accessory;
        this.config = config;
        const { Characteristic, Service } = hap;
        this.registerCharacteristic({
            characteristicType: Characteristic.On,
            serviceType: Service.Switch,
            getValue: (data) => Boolean(data.basicValue),
            setValue: (value) => this.setOnState(value),
        });
    }
    setOnState(on) {
        logInfo(`Turning ${this.device.name} ${on ? 'On' : 'Off'}`);
        return this.device.setInfo({ device: { v1: { basicValue: on ? 255 : 0 } } });
    }
}
