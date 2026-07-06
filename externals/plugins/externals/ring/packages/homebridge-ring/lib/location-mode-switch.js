import { distinctUntilChanged } from 'rxjs/operators';
import { hap } from "./hap.js";
import { logError, logInfo } from 'ring-client-api/util';
import { BaseAccessory } from "./base-accessory.js";
import { firstValueFrom, of } from 'rxjs';
function getStateFromMode(mode) {
    const { Characteristic: { SecuritySystemCurrentState: State }, } = hap;
    switch (mode) {
        case 'away':
            return State.AWAY_ARM;
        case 'home':
            return State.STAY_ARM;
        case 'disarmed':
            return State.DISARMED;
        default:
            return State.DISARMED;
    }
}
export class LocationModeSwitch extends BaseAccessory {
    targetState;
    device;
    location;
    accessory;
    config;
    constructor(location, accessory, config) {
        super();
        this.location = location;
        this.accessory = accessory;
        this.config = config;
        this.device = location; // for use in BaseAccessory
        const { Characteristic, Service: { SecuritySystem, AccessoryInformation }, } = hap, accessoryName = location.name + ' Mode', service = this.getService(SecuritySystem, accessoryName), currentState = service.getCharacteristic(Characteristic.SecuritySystemCurrentState), targetState = service.getCharacteristic(Characteristic.SecuritySystemTargetState), getCurrentMode = () => {
            return firstValueFrom(location.onLocationMode);
        }, getCurrentState = async () => getStateFromMode(await getCurrentMode());
        location.onLocationMode.pipe(distinctUntilChanged()).subscribe((mode) => {
            const state = getStateFromMode(mode);
            if (state === this.targetState) {
                this.targetState = undefined;
            }
            if (!this.targetState) {
                targetState.updateValue(state);
            }
            currentState.updateValue(state);
        });
        currentState.on("get" /* CharacteristicEventTypes.GET */, async (callback) => {
            location.getLocationMode().catch((e) => {
                logError('Failed to retrieve location mode for ' + location.name);
                logError(e);
            });
            const state = await getCurrentState();
            if (state === this.targetState) {
                this.targetState = undefined;
            }
            callback(null, state);
        });
        targetState.on("get" /* CharacteristicEventTypes.GET */, async (callback) => {
            callback(null, this.targetState !== undefined
                ? this.targetState
                : await getCurrentState());
        });
        targetState.on("set" /* CharacteristicEventTypes.SET */, async (state, callback) => {
            const { Characteristic: { SecuritySystemTargetState: State }, } = hap;
            callback();
            if (state === State.NIGHT_ARM) {
                state = State.STAY_ARM;
                // Ring doesn't have night mode, so switch over to stay mode
                setTimeout(() => targetState.updateValue(state), 100);
            }
            if (state === (await getCurrentState())) {
                this.targetState = undefined;
                return;
            }
            this.targetState = state;
            if (state === State.AWAY_ARM) {
                logInfo(`Setting ${this.location.name} Mode to away`);
                return this.location.setLocationMode('away');
            }
            else if (state === State.DISARM) {
                logInfo(`Setting ${this.location.name} Mode to disarmed`);
                return this.location.setLocationMode('disarmed');
            }
            logInfo(`Setting ${this.location.name} Mode to home`);
            return this.location.setLocationMode('home');
        });
        targetState.setProps({
            validValues: [
                Characteristic.SecuritySystemTargetState.AWAY_ARM,
                Characteristic.SecuritySystemTargetState.STAY_ARM,
                Characteristic.SecuritySystemTargetState.DISARM,
            ],
        });
        this.registerObservableCharacteristic({
            characteristicType: Characteristic.Manufacturer,
            serviceType: AccessoryInformation,
            onValue: of('Ring'),
        });
        this.registerObservableCharacteristic({
            characteristicType: Characteristic.Model,
            serviceType: AccessoryInformation,
            onValue: of('Location Mode'),
        });
        this.registerObservableCharacteristic({
            characteristicType: Characteristic.SerialNumber,
            serviceType: AccessoryInformation,
            onValue: of('N/A'),
        });
    }
}
