import { BaseAccessory } from "./base-accessory.js";
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, map } from 'rxjs/operators';
import { logError } from 'ring-client-api/util';
export class BaseDataAccessory extends BaseAccessory {
    registerCharacteristic({ characteristicType, serviceType, getValue, setValue, setValueDebounceTime = 0, name, requestUpdate, serviceSubType, }) {
        const service = this.getService(serviceType, name, serviceSubType), characteristic = service.getCharacteristic(characteristicType), { device } = this;
        if (requestUpdate) {
            // Only register for GET if an async request should be made to get an updated value
            characteristic.on("get" /* CharacteristicEventTypes.GET */, (callback) => {
                try {
                    const value = getValue(device.data);
                    callback(null, value);
                    requestUpdate();
                }
                catch (e) {
                    callback(e);
                }
            });
        }
        if (setValue && setValueDebounceTime) {
            const onValueToSet = new Subject();
            characteristic.on("set" /* CharacteristicEventTypes.SET */, (newValue, callback) => {
                onValueToSet.next(newValue);
                callback();
            });
            onValueToSet.pipe(debounceTime(setValueDebounceTime)).subscribe(setValue);
        }
        else if (setValue) {
            characteristic.on("set" /* CharacteristicEventTypes.SET */, (newValue, callback) => {
                Promise.resolve(setValue(newValue)).catch(logError);
                callback();
            });
        }
        ;
        this.device.onData
            .pipe(map(getValue), distinctUntilChanged())
            .subscribe((value) => characteristic.updateValue(value));
    }
    registerLevelCharacteristic({ characteristicType, serviceType, getValue, setValue, requestUpdate, }) {
        let targetLevel;
        this.registerCharacteristic({
            characteristicType,
            serviceType,
            getValue: (data) => {
                const newLevel = getValue(data);
                if (newLevel === targetLevel) {
                    targetLevel = undefined;
                }
                return targetLevel === undefined ? newLevel : targetLevel;
            },
            setValue: (level) => {
                targetLevel = level;
                setValue(level);
            },
            setValueDebounceTime: 500,
            requestUpdate,
        });
    }
}
