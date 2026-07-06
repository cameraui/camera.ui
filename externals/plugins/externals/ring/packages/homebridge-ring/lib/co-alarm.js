import { BaseDeviceAccessory } from "./base-device-accessory.js";
import { hap } from "./hap.js";
export class CoAlarm extends BaseDeviceAccessory {
    device;
    accessory;
    config;
    constructor(device, accessory, config) {
        super();
        this.device = device;
        this.accessory = accessory;
        this.config = config;
        const { Characteristic: { CarbonMonoxideDetected }, Service: { CarbonMonoxideSensor }, } = hap;
        this.registerCharacteristic({
            characteristicType: CarbonMonoxideDetected,
            serviceType: CarbonMonoxideSensor,
            getValue: (data) => {
                return data.alarmStatus === 'active'
                    ? CarbonMonoxideDetected.CO_LEVELS_ABNORMAL
                    : CarbonMonoxideDetected.CO_LEVELS_NORMAL;
            },
        });
        this.initSensorService(CarbonMonoxideSensor);
    }
}
