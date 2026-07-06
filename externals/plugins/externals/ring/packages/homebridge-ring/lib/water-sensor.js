import { BaseDeviceAccessory } from "./base-device-accessory.js";
import { hap } from "./hap.js";
import { distinctUntilChanged, filter, map } from 'rxjs/operators';
import { logInfo } from 'ring-client-api/util';
export class WaterSensor extends BaseDeviceAccessory {
    device;
    accessory;
    config;
    constructor(device, accessory, config) {
        super();
        this.device = device;
        this.accessory = accessory;
        this.config = config;
        const { Characteristic: { LeakDetected }, } = hap, leakService = this.getService(hap.Service.LeakSensor), onWaterDetected = device.onData.pipe(map((data) => {
            return data.faulted
                ? LeakDetected.LEAK_DETECTED
                : LeakDetected.LEAK_NOT_DETECTED;
        }), distinctUntilChanged());
        this.initSensorService(leakService);
        this.registerObservableCharacteristic({
            characteristicType: LeakDetected,
            serviceType: leakService,
            onValue: onWaterDetected,
        });
        onWaterDetected
            .pipe(filter((faulted) => Boolean(faulted)))
            .subscribe(() => {
            logInfo(device.name + ' Detected Water');
        });
    }
}
