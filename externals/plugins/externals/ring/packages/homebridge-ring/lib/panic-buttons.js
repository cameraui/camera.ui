import { hap } from "./hap.js";
import { BaseDataAccessory } from "./base-data-accessory.js";
import { logInfo } from 'ring-client-api/util';
const burglarStates = [
    'burglar-alarm',
    'user-verified-burglar-alarm',
    'burglar-accelerated-alarm',
], fireStates = [
    'fire-alarm',
    'user-verified-co-or-fire-alarm',
    'fire-accelerated-alarm',
];
function matchesAnyAlarmState({ alarmInfo }, targetStates) {
    return Boolean(alarmInfo && targetStates.includes(alarmInfo.state));
}
const burglarAlarmName = 'Burglar Alarm', fireAlarmName = 'Fire Alarm';
export class PanicButtons extends BaseDataAccessory {
    device;
    accessory;
    config;
    constructor(device, accessory, config) {
        super();
        this.device = device;
        this.accessory = accessory;
        this.config = config;
        const { Characteristic, Service } = hap, locationName = device.location.name;
        this.registerCharacteristic({
            characteristicType: Characteristic.On,
            serviceType: Service.Switch,
            serviceSubType: 'Burglar',
            name: burglarAlarmName,
            getValue: (data) => matchesAnyAlarmState(data, burglarStates),
            setValue: (on) => {
                if (on) {
                    logInfo(`Burglar Alarm activated for ${locationName}`);
                    return this.device.location.triggerBurglarAlarm();
                }
                logInfo(`Burglar Alarm turned off for ${locationName}`);
                return this.device.location.setAlarmMode('none');
            },
        });
        this.registerCharacteristic({
            characteristicType: Characteristic.Name,
            serviceType: Service.Switch,
            serviceSubType: 'Burglar',
            name: burglarAlarmName,
            getValue: () => burglarAlarmName,
        });
        this.registerCharacteristic({
            characteristicType: Characteristic.ConfiguredName,
            serviceType: Service.Switch,
            serviceSubType: 'Burglar',
            name: burglarAlarmName,
            getValue: () => burglarAlarmName,
        });
        this.registerCharacteristic({
            characteristicType: Characteristic.On,
            serviceType: Service.Switch,
            serviceSubType: 'Fire',
            name: fireAlarmName,
            getValue: (data) => matchesAnyAlarmState(data, fireStates),
            setValue: (on) => {
                if (on) {
                    logInfo(`Fire Alarm activated for ${locationName}`);
                    return this.device.location.triggerFireAlarm();
                }
                logInfo(`Fire Alarm turned off for ${locationName}`);
                return this.device.location.setAlarmMode('none');
            },
        });
        this.registerCharacteristic({
            characteristicType: Characteristic.Name,
            serviceType: Service.Switch,
            serviceSubType: 'Fire',
            name: fireAlarmName,
            getValue: () => fireAlarmName,
        });
        this.registerCharacteristic({
            characteristicType: Characteristic.ConfiguredName,
            serviceType: Service.Switch,
            serviceSubType: 'Fire',
            name: fireAlarmName,
            getValue: () => fireAlarmName,
        });
    }
    initBase() {
        const { Characteristic, Service } = hap;
        this.registerCharacteristic({
            characteristicType: Characteristic.Manufacturer,
            serviceType: Service.AccessoryInformation,
            getValue: (data) => data.manufacturerName || 'Ring',
        });
        this.registerCharacteristic({
            characteristicType: Characteristic.Model,
            serviceType: Service.AccessoryInformation,
            getValue: () => 'Panic Buttons for ' + this.device.location.name,
        });
        this.registerCharacteristic({
            characteristicType: Characteristic.SerialNumber,
            serviceType: Service.AccessoryInformation,
            getValue: () => 'None',
        });
        super.initBase();
    }
}
