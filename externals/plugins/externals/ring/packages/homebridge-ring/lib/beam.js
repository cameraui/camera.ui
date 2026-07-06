import { RingDeviceType } from 'ring-client-api';
import { hap } from "./hap.js";
import { BaseDeviceAccessory } from "./base-device-accessory.js";
import { logInfo } from 'ring-client-api/util';
export class Beam extends BaseDeviceAccessory {
    isLightGroup;
    groupId;
    device;
    accessory;
    config;
    constructor(device, accessory, config) {
        super();
        this.device = device;
        this.accessory = accessory;
        this.config = config;
        this.isLightGroup =
            device.data.deviceType === RingDeviceType.BeamsLightGroupSwitch;
        this.groupId = device.data.groupId;
        const { Characteristic, Service } = hap, { MotionSensor } = Service, { data: { deviceType }, } = device;
        if (deviceType !== RingDeviceType.BeamsMotionSensor) {
            this.registerCharacteristic({
                characteristicType: Characteristic.On,
                serviceType: Service.Lightbulb,
                getValue: (data) => Boolean(data.on),
                setValue: (value) => this.setOnState(value),
            });
            this.getService(Service.Lightbulb).setPrimaryService(true);
        }
        if (deviceType === RingDeviceType.BeamsMultiLevelSwitch) {
            this.registerLevelCharacteristic({
                characteristicType: Characteristic.Brightness,
                serviceType: Service.Lightbulb,
                getValue: (data) => {
                    return data.level && !isNaN(data.level) ? 100 * data.level : 0;
                },
                setValue: (value) => this.setLevelState(value),
            });
        }
        if (device.data.motionStatus !== undefined &&
            device.data.motionSensorEnabled !== false) {
            this.registerCharacteristic({
                characteristicType: hap.Characteristic.MotionDetected,
                serviceType: MotionSensor,
                getValue: (data) => data.motionStatus === 'faulted',
            });
            this.initSensorService(MotionSensor);
        }
    }
    setOnState(on) {
        logInfo(`Turning ${this.device.name} ${on ? 'On' : 'Off'}`);
        const { beamDurationSeconds } = this.config, duration = beamDurationSeconds
            ? Math.min(beamDurationSeconds, 32767)
            : undefined;
        if (this.isLightGroup && this.groupId) {
            return this.device.location.setLightGroup(this.groupId, on, duration);
        }
        const data = on ? { lightMode: 'on', duration } : { lightMode: 'default' };
        return this.device.sendCommand('light-mode.set', data);
    }
    setLevelState(level) {
        logInfo(`Setting brightness of ${this.device.name} to ${level}%`);
        return this.device.setInfo({
            device: { v1: { level: level / 100 } },
        });
    }
}
