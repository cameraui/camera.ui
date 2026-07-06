import { readFileSync, writeFileSync } from 'fs';
import { createHash, randomBytes } from 'crypto';
import { join } from 'path';
const systemIdFileName = '.ring.json';
export const controlCenterDisplayName = 'homebridge-ring';
export function updateHomebridgeConfig(homebridge, update) {
    const configPath = homebridge.user.configPath(), config = readFileSync(configPath).toString(), updatedConfig = update(config);
    if (config !== updatedConfig) {
        writeFileSync(configPath, updatedConfig);
        return true;
    }
    return false;
}
function createSystemId() {
    return createHash('sha256').update(randomBytes(32)).digest('hex');
}
export function getSystemId(homebridgeStoragePath) {
    const filePath = join(homebridgeStoragePath, systemIdFileName);
    try {
        const ringContext = JSON.parse(readFileSync(filePath).toString());
        if (ringContext.systemId) {
            return ringContext.systemId;
        }
    }
    catch {
        // expect errors if file doesn't exist or is in a bad format
    }
    const systemId = createSystemId(), ringContext = { systemId };
    writeFileSync(filePath, JSON.stringify(ringContext));
    return systemId;
}
export const debug = process.env.RING_DEBUG === 'true';
