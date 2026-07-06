import { hap } from "./hap.js";
import { shareReplay, take } from 'rxjs/operators';
import { firstValueFrom } from 'rxjs';
import { debug } from "./config.js";
import { logError, logInfo } from 'ring-client-api/util';
function isServiceInstance(serviceType) {
    return typeof serviceType === 'object';
}
export class BaseAccessory {
    servicesInUse = [];
    initBase() {
        this.pruneUnusedServices();
    }
    getService(serviceType, name = this.device.name, subType) {
        if (isServiceInstance(serviceType)) {
            return serviceType;
        }
        if (debug) {
            name = 'TEST ' + name;
        }
        const existingService = subType
            ? this.accessory.getServiceById(serviceType, subType)
            : this.accessory.getService(serviceType), service = existingService ||
            this.accessory.addService(serviceType, name, subType);
        if (debug &&
            existingService &&
            existingService.displayName &&
            name !== existingService.displayName) {
            throw new Error(`Overlapping services for device ${this.device.name} - ${name} != ${existingService.displayName} - ${serviceType}`);
        }
        if (!this.servicesInUse.includes(service)) {
            this.servicesInUse.push(service);
        }
        return service;
    }
    registerObservableCharacteristic({ characteristicType, serviceType, serviceSubType, onValue, setValue, name, requestUpdate, }) {
        const service = this.getService(serviceType, name, serviceSubType), characteristic = service.getCharacteristic(characteristicType), onCachedValue = onValue.pipe(shareReplay(1));
        onCachedValue.subscribe((value) => {
            characteristic.updateValue(value);
        });
        if (requestUpdate) {
            // Only register for GET if an async request should be made to get an updated value
            onCachedValue.pipe(take(1)).subscribe(() => {
                // allow GET once a value is cached
                characteristic.on("get" /* CharacteristicEventTypes.GET */, async (callback) => {
                    try {
                        const value = await firstValueFrom(onCachedValue);
                        callback(null, value);
                        requestUpdate();
                    }
                    catch (e) {
                        callback(e);
                    }
                });
            });
        }
        if (setValue) {
            characteristic.on("set" /* CharacteristicEventTypes.SET */, (newValue, callback) => {
                Promise.resolve(setValue(newValue)).catch((e) => {
                    logError(e);
                });
                callback();
            });
        }
    }
    pruneUnusedServices() {
        const safeServiceUUIDs = [hap.Service.CameraRTPStreamManagement.UUID];
        this.accessory.services.forEach((service) => {
            if (!this.servicesInUse.includes(service) &&
                !safeServiceUUIDs.includes(service.UUID)) {
                logInfo('Pruning unused service', service.UUID, service.displayName || service.name, 'from', this.device.name);
                this.accessory.removeService(service);
            }
        });
    }
}
