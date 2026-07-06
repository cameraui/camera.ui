import { BaseDeviceAccessory } from "./base-device-accessory.js";
import { hap } from "./hap.js";
export class MotionSensor extends BaseDeviceAccessory {
    device;
    accessory;
    config;
    constructor(device, accessory, config) {
        super();
        this.device = device;
        this.accessory = accessory;
        this.config = config;
        const { Service } = hap;
        this.registerCharacteristic({
            characteristicType: hap.Characteristic.MotionDetected,
            serviceType: Service.MotionSensor,
            getValue: (data) => data.faulted,
        });
        this.initSensorService(Service.MotionSensor);
    }
}
