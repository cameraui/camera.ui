import debug from 'debug';
import colors from 'colors';
import { createInterface } from 'readline';
import { v4 as generateRandomUuid, v5 as generateUuidFromNamespace } from 'uuid';
import { uuid as getSystemUuid } from 'systeminformation';
import pushReceiverLogger from '@eneris/push-receiver/dist/utils/logger.js';
const debugLogger = debug('ring'), uuidNamespace = 'e53ffdc0-e91d-4ce1-bec2-df939d94739d';
let logger = {
    logInfo(message) {
        debugLogger(message);
    },
    logError(message) {
        debugLogger(colors.red(message));
    },
}, debugEnabled = false;
const timeouts = new Set();
export function clearTimeouts() {
    timeouts.forEach((timeout) => {
        clearTimeout(timeout);
    });
}
export function delay(milliseconds) {
    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            timeouts.delete(timeout);
            resolve(undefined);
        }, milliseconds);
        timeouts.add(timeout);
    });
}
export function logDebug(message) {
    if (debugEnabled) {
        logger.logInfo(message);
    }
}
export function logInfo(...message) {
    logger.logInfo(...message);
}
export function logError(message) {
    logger.logError(message);
}
export function useLogger(newLogger) {
    logger = newLogger;
}
export function enableDebug() {
    debugEnabled = true;
}
export function generateUuid(seed) {
    if (seed) {
        return generateUuidFromNamespace(seed, uuidNamespace);
    }
    return generateRandomUuid();
}
export async function getHardwareId(systemId) {
    if (systemId) {
        return generateUuid(systemId);
    }
    const timeoutValue = '-1', { os: id } = await Promise.race([
        getSystemUuid(),
        delay(5000).then(() => ({ os: timeoutValue })),
    ]);
    if (id === timeoutValue) {
        logError('Request for system uuid timed out.  Falling back to random session id');
        return generateRandomUuid();
    }
    if (id === '-') {
        // default value set by systeminformation if it can't find a real value
        logError('Unable to get system uuid.  Falling back to random session id');
        return generateRandomUuid();
    }
    return generateUuid(id);
}
export async function requestInput(question) {
    const lineReader = createInterface({
        input: process.stdin,
        output: process.stdout,
    }), answer = await new Promise((resolve) => {
        lineReader.question(question, resolve);
    });
    lineReader.close();
    return answer.trim();
}
export function stringify(data) {
    if (typeof data === 'string') {
        return data;
    }
    if (typeof data === 'object' && Buffer.isBuffer(data)) {
        return data.toString();
    }
    return JSON.stringify(data) + '';
}
export function mapAsync(records, asyncMapper) {
    return Promise.all(records.map((record) => asyncMapper(record)));
}
export function randomInteger() {
    return Math.floor(Math.random() * 99999999) + 100000;
}
export function randomString(length) {
    const uuid = generateUuid();
    return uuid.replace(/-/g, '').substring(0, length).toLowerCase();
}
// Override push receiver logging to avoid ECONNRESET errors leaking
function logPushReceiver(...args) {
    try {
        if (args[0].toString().includes('ECONNRESET')) {
            // don't log ECONNRESET errors
            return;
        }
    }
    catch (_) {
        // proceed to log error
    }
    logDebug('[Push Receiver]');
    logDebug(args[0]);
}
const pushReceiverLoggerDefault = pushReceiverLogger.default || pushReceiverLogger; // fix for vitest
pushReceiverLoggerDefault.error = logPushReceiver;
export function fromBase64(encodedInput) {
    const buff = Buffer.from(encodedInput, 'base64');
    return buff.toString('ascii');
}
export function toBase64(input) {
    const buff = Buffer.from(input);
    return buff.toString('base64');
}
export function buildSearchString(search) {
    return ('?' +
        Object.entries(search)
            .filter(([, value]) => value !== undefined && value !== null)
            .map(([key, value]) => `${key}=${value}`)
            .join('&'));
}
