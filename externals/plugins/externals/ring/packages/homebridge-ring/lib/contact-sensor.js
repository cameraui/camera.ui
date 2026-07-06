import { BaseDeviceAccessory } from "./base-device-accessory.js";
import { hap } from "./hap.js";
export class ContactSensor extends BaseDeviceAccessory {
    device;
    accessory;
    config;
    constructor(device, accessory, config) {
        super();
        this.device = device;
        this.accessory = accessory;
        this.config = config;
        const { Characteristic: { ContactSensorState }, Service, } = hap;
        this.registerCharacteristic({
            characteristicType: ContactSensorState,
            serviceType: Service.ContactSensor,
            getValue: (data) => {
                return data.faulted
                    ? ContactSensorState.CONTACT_NOT_DETECTED
                    : ContactSensorState.CONTACT_DETECTED;
            },
        });
        this.initSensorService(Service.ContactSensor);
    }
}
