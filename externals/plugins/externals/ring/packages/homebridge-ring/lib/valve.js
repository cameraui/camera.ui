import { BaseDeviceAccessory } from "./base-device-accessory.js";
import { hap } from "./hap.js";
import { logInfo } from 'ring-client-api/util';
export class Valve extends BaseDeviceAccessory {
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
            getValue: (data) => this.isOpen(data.valveState),
            setValue: (value) => this.setOnState(value),
        });
    }
    isOpen(status) {
        if (status === 'open') {
            return true;
        }
        return false;
    }
    setOnState(on) {
        logInfo(`Turning ${this.device.name} ${on ? 'On' : 'Off'}`);
        if (on) {
            return this.device.sendCommand('valve.open');
        }
        return this.device.sendCommand('valve.close');
    }
}
