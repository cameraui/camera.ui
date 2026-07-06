import { BaseDeviceAccessory } from "./base-device-accessory.js";
import { hap } from "./hap.js";
import { distinctUntilChanged, filter, map } from 'rxjs/operators';
import { logInfo } from 'ring-client-api/util';
export class FreezeSensor extends BaseDeviceAccessory {
    device;
    accessory;
    config;
    constructor(device, accessory, config) {
        super();
        this.device = device;
        this.accessory = accessory;
        this.config = config;
        const { Characteristic: { OccupancyDetected }, Service: { OccupancySensor }, } = hap, onFreezeDetected = device.onData.pipe(map((data) => {
            return data.faulted
                ? OccupancyDetected.OCCUPANCY_DETECTED
                : OccupancyDetected.OCCUPANCY_NOT_DETECTED;
        }), distinctUntilChanged());
        this.initSensorService(OccupancySensor);
        this.registerObservableCharacteristic({
            characteristicType: OccupancyDetected,
            serviceType: OccupancySensor,
            onValue: onFreezeDetected,
        });
        onFreezeDetected
            .pipe(filter((faulted) => Boolean(faulted)))
            .subscribe(() => {
            logInfo(device.name + ' Detected Freezing');
        });
    }
}
