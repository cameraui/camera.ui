import { BaseDeviceAccessory } from "./base-device-accessory.js";
import { hap } from "./hap.js";
import { logInfo } from 'ring-client-api/util';
export class Fan extends BaseDeviceAccessory {
    device;
    accessory;
    config;
    constructor(device, accessory, config) {
        super();
        this.device = device;
        this.accessory = accessory;
        this.config = config;
        const { Characteristic, Service } = hap, { data: initialData } = this.device;
        this.registerCharacteristic({
            characteristicType: Characteristic.On,
            serviceType: Service.Fan,
            getValue: (data) => Boolean(data.on),
            setValue: (value) => this.setOnState(value),
        });
        if (initialData.level !== undefined) {
            this.registerLevelCharacteristic({
                characteristicType: Characteristic.RotationSpeed,
                serviceType: Service.Fan,
                getValue: (data) => {
                    return data.level && !isNaN(data.level) ? 100 * data.level : 0;
                },
                setValue: (value) => this.setLevelState(value),
            });
        }
    }
    setOnState(on) {
        logInfo(`Turning ${this.device.name} ${on ? 'On' : 'Off'}`);
        return this.device.setInfo({ device: { v1: { on } } });
    }
    setLevelState(level) {
        logInfo(`Setting speed of ${this.device.name} to ${level}%`);
        return this.device.setInfo({
            device: { v1: { level: level / 100 } },
        });
    }
}
