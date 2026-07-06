import { BaseDeviceAccessory } from "./base-device-accessory.js";
import { hap } from "./hap.js";
export class SmokeAlarm extends BaseDeviceAccessory {
    device;
    accessory;
    config;
    constructor(device, accessory, config) {
        super();
        this.device = device;
        this.accessory = accessory;
        this.config = config;
        const { Characteristic: { SmokeDetected }, Service: { SmokeSensor }, } = hap;
        this.registerCharacteristic({
            characteristicType: SmokeDetected,
            serviceType: SmokeSensor,
            getValue: (data) => {
                return data.alarmStatus === 'active'
                    ? SmokeDetected.SMOKE_DETECTED
                    : SmokeDetected.SMOKE_NOT_DETECTED;
            },
        });
        this.initSensorService(SmokeSensor);
    }
}
