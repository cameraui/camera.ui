import { BaseDeviceAccessory } from "./base-device-accessory.js";
import { hap } from "./hap.js";
export class SmokeCoListener extends BaseDeviceAccessory {
    device;
    accessory;
    config;
    constructor(device, accessory, config) {
        super();
        this.device = device;
        this.accessory = accessory;
        this.config = config;
        const { Characteristic: { SmokeDetected, CarbonMonoxideDetected }, Service: { SmokeSensor, CarbonMonoxideSensor }, } = hap;
        this.registerCharacteristic({
            characteristicType: SmokeDetected,
            serviceType: SmokeSensor,
            getValue: (data) => {
                const smokeAlarmStatus = data.smoke?.alarmStatus ??
                    data.components?.['alarm.smoke']?.alarmStatus;
                return smokeAlarmStatus === 'active'
                    ? SmokeDetected.SMOKE_DETECTED
                    : SmokeDetected.SMOKE_NOT_DETECTED;
            },
        });
        this.registerCharacteristic({
            characteristicType: CarbonMonoxideDetected,
            serviceType: CarbonMonoxideSensor,
            getValue: (data) => {
                const coAlarmStatus = data.co?.alarmStatus ?? data.components?.['alarm.co']?.alarmStatus;
                return coAlarmStatus === 'active'
                    ? CarbonMonoxideDetected.CO_LEVELS_ABNORMAL
                    : CarbonMonoxideDetected.CO_LEVELS_NORMAL;
            },
        });
        this.initSensorService(SmokeSensor);
        this.initSensorService(CarbonMonoxideSensor);
    }
}
