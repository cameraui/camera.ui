import { hap } from "./hap.js";
import { BaseDataAccessory } from "./base-data-accessory.js";
function getBatteryLevel({ batteryLevel, batteryStatus }) {
    if (batteryLevel !== undefined) {
        return batteryLevel;
    }
    else if (batteryStatus === 'full' || batteryStatus === 'charged') {
        return 100;
    }
    else if (batteryStatus === 'ok' || batteryStatus === 'charging') {
        return 50;
    }
    return 0;
}
function getStatusLowBattery(data) {
    const { StatusLowBattery } = hap.Characteristic, batteryLevel = getBatteryLevel(data);
    return batteryLevel > 20
        ? StatusLowBattery.BATTERY_LEVEL_NORMAL
        : StatusLowBattery.BATTERY_LEVEL_LOW;
}
function getBatteryChargingState({ batteryStatus, batteryBackup, acStatus, }) {
    const { ChargingState } = hap.Characteristic;
    if (batteryStatus === 'charging' ||
        batteryStatus === 'charged' ||
        batteryBackup === 'charged' ||
        batteryBackup === 'charging' ||
        acStatus === 'ok') {
        return ChargingState.CHARGING;
    }
    if (batteryBackup === 'inUse' || acStatus === 'error') {
        return ChargingState.NOT_CHARGING;
    }
    return ChargingState.NOT_CHARGEABLE;
}
function hasBatteryStatus({ batteryStatus }) {
    return batteryStatus !== 'none';
}
export class BaseDeviceAccessory extends BaseDataAccessory {
    initBase() {
        const { device: { data: initialData }, device, } = this, { Characteristic, Service } = hap;
        this.registerCharacteristic({
            characteristicType: Characteristic.Manufacturer,
            serviceType: Service.AccessoryInformation,
            getValue: (data) => data.manufacturerName || 'Ring',
        });
        this.registerCharacteristic({
            characteristicType: Characteristic.Model,
            serviceType: Service.AccessoryInformation,
            getValue: (data) => data.deviceType,
        });
        this.registerCharacteristic({
            characteristicType: Characteristic.SerialNumber,
            serviceType: Service.AccessoryInformation,
            getValue: (data) => data.serialNumber || 'Unknown',
        });
        if ('volume' in initialData && 'setVolume' in device) {
            this.registerCharacteristic({
                characteristicType: Characteristic.Mute,
                serviceType: Service.Speaker,
                getValue: () => false,
            });
            this.registerLevelCharacteristic({
                characteristicType: Characteristic.Volume,
                serviceType: Service.Speaker,
                getValue: (data) => {
                    return data.volume ? data.volume * 100 : 0;
                },
                setValue: (volume) => device.setVolume(volume / 100),
            });
        }
        if (hasBatteryStatus(initialData)) {
            this.registerCharacteristic({
                characteristicType: Characteristic.BatteryLevel,
                serviceType: Service.Battery,
                getValue: getBatteryLevel,
            });
            this.registerCharacteristic({
                characteristicType: Characteristic.StatusLowBattery,
                serviceType: Service.Battery,
                getValue: getStatusLowBattery,
            });
            this.registerCharacteristic({
                characteristicType: Characteristic.ChargingState,
                serviceType: Service.Battery,
                getValue: getBatteryChargingState,
            });
        }
        super.initBase();
    }
    initSensorService(serviceType) {
        const { Characteristic } = hap;
        this.registerCharacteristic({
            characteristicType: Characteristic.StatusTampered,
            serviceType,
            getValue: (data) => {
                return data.tamperStatus === 'ok'
                    ? Characteristic.StatusTampered.NOT_TAMPERED
                    : Characteristic.StatusTampered.TAMPERED;
            },
        });
        if (hasBatteryStatus(this.device.data)) {
            this.registerCharacteristic({
                characteristicType: Characteristic.StatusLowBattery,
                serviceType,
                getValue: (data) => getStatusLowBattery(data),
            });
        }
    }
}
