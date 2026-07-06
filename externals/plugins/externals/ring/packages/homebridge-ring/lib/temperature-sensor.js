import { BaseDeviceAccessory } from "./base-device-accessory.js";
import { hap } from "./hap.js";
import { distinctUntilChanged, map } from 'rxjs/operators';
export class TemperatureSensor extends BaseDeviceAccessory {
    device;
    accessory;
    config;
    constructor(device, accessory, config) {
        super();
        this.device = device;
        this.accessory = accessory;
        this.config = config;
        const { Characteristic: { CurrentTemperature }, Service: { TemperatureSensor: TempSensorService }, } = hap;
        this.registerObservableCharacteristic({
            characteristicType: CurrentTemperature,
            serviceType: TempSensorService,
            onValue: device.onData.pipe(map((data) => {
                return data.celsius;
            }), distinctUntilChanged()),
        });
        this.initSensorService(TempSensorService);
    }
}
