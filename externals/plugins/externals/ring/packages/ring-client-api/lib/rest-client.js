import { delay, fromBase64, getHardwareId, logDebug, logError, logInfo, stringify, toBase64, } from "./util.js";
import { ReplaySubject } from 'rxjs';
import assert from 'assert';
import { Agent } from 'undici';
const fetchAgent = new Agent({
    connections: 6,
    pipelining: 1,
    keepAliveTimeout: 115000,
}), defaultRequestOptions = {
    responseType: 'json',
    method: 'GET',
    timeout: 20000,
}, ringErrorCodes = {
    7050: 'NO_ASSET',
    7019: 'ASSET_OFFLINE',
    7061: 'ASSET_CELL_BACKUP',
    7062: 'UPDATING',
    7063: 'MAINTENANCE',
}, clientApiBaseUrl = 'https://api.ring.com/clients_api/', deviceApiBaseUrl = 'https://api.ring.com/devices/v1/', commandsApiBaseUrl = 'https://api.ring.com/commands/v1/', appApiBaseUrl = 'https://prd-api-us.prd.rings.solutions/api/v1/', apiVersion = 11;
export function clientApi(path) {
    return clientApiBaseUrl + path;
}
export function deviceApi(path) {
    return deviceApiBaseUrl + path;
}
export function commandsApi(path) {
    return commandsApiBaseUrl + path;
}
export function appApi(path) {
    return appApiBaseUrl + path;
}
async function responseToError(response) {
    const error = new Error();
    error.response = {
        headers: response.headers,
        status: response.status,
        body: null,
    };
    try {
        const bodyText = await response.text();
        try {
            error.response.body = JSON.parse(bodyText);
        }
        catch {
            error.response.body = bodyText;
        }
    }
    catch {
        // ignore
    }
    return error;
}
async function requestWithRetry(requestOptions, retryCount = 0) {
    if (typeof fetch !== 'function') {
        throw new Error(`Your current NodeJS version (${process.version}) is too old to support this plugin.  Please upgrade to the latest LTS version of NodeJS.`);
    }
    try {
        if (requestOptions.json || requestOptions.responseType === 'json') {
            requestOptions.headers = {
                ...requestOptions.headers,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            };
            if (requestOptions.json) {
                requestOptions.body = JSON.stringify(requestOptions.json);
            }
            delete requestOptions.json;
        }
        const options = {
            ...defaultRequestOptions,
            ...requestOptions,
            dispatcher: fetchAgent,
        };
        // If a timeout is provided, create an AbortSignal for it
        if (options.timeout && !options.signal) {
            options.signal = AbortSignal.timeout(options.timeout);
        }
        // make the fetch request
        const response = await fetch(options.url, options), headers = response.headers;
        if (!response.ok) {
            const error = await responseToError(response);
            throw error;
        }
        let data;
        if (options.responseType === 'buffer') {
            const arrayBuffer = await response.arrayBuffer();
            data = Buffer.from(arrayBuffer);
        }
        else {
            const text = await response.text();
            try {
                data = JSON.parse(text);
            }
            catch {
                data = text;
            }
        }
        if (data !== null && typeof data === 'object') {
            const date = headers.get('date');
            if (date) {
                data.responseTimestamp = new Date(date).getTime();
            }
            const xTime = headers.get('x-time-millis');
            if (xTime) {
                data.timeMillis = Number(xTime);
            }
        }
        return data;
    }
    catch (e) {
        if (!e.response && !requestOptions.allowNoResponse) {
            if (retryCount > 0) {
                let detailedError = `Error: ${e.message}`;
                detailedError += e.cause?.message ? `, Cause: ${e.cause.message}` : '';
                detailedError += e.cause?.code ? `, Code: ${e.cause.code}` : '';
                logError(`Retry #${retryCount} failed to reach Ring server at ${requestOptions.url}.  ${detailedError}.  Trying again in 5 seconds...`);
                if (e.message.includes('NGHTTP2_ENHANCE_YOUR_CALM')) {
                    logError(`There is a known issue with your current NodeJS version (${process.version}).  Please see https://github.com/dgreif/ring/wiki/NGHTTP2_ENHANCE_YOUR_CALM-Error for details`);
                }
                logDebug(e);
            }
            await delay(5000);
            return requestWithRetry(requestOptions, retryCount + 1);
        }
        throw e;
    }
}
function parseAuthConfig(rawRefreshToken) {
    if (!rawRefreshToken) {
        return;
    }
    try {
        const config = JSON.parse(fromBase64(rawRefreshToken));
        assert(config);
        assert(config.rt);
        return config;
    }
    catch {
        return {
            rt: rawRefreshToken,
        };
    }
}
export class RingRestClient {
    refreshToken;
    authConfig;
    hardwareIdPromise;
    _authPromise;
    timeouts = [];
    clearPreviousAuth() {
        this._authPromise = undefined;
    }
    get authPromise() {
        if (!this._authPromise) {
            const authPromise = this.getAuth();
            this._authPromise = authPromise;
            authPromise
                .then(({ expires_in }) => {
                // clear the existing auth promise 1 minute before it expires
                const timeout = setTimeout(() => {
                    if (this._authPromise === authPromise) {
                        this.clearPreviousAuth();
                    }
                }, ((expires_in || 3600) - 60) * 1000);
                this.timeouts.push(timeout);
            })
                .catch(() => {
                // ignore these errors here, they should be handled by the function making a rest request
            });
        }
        return this._authPromise;
    }
    sessionPromise = undefined;
    using2fa = false;
    promptFor2fa;
    onRefreshTokenUpdated = new ReplaySubject(1);
    onSession = new ReplaySubject(1);
    baseSessionMetadata;
    authOptions;
    constructor(authOptions) {
        this.authOptions = authOptions;
        this.refreshToken =
            'refreshToken' in authOptions ? authOptions.refreshToken : undefined;
        this.authConfig = parseAuthConfig(this.refreshToken);
        this.hardwareIdPromise =
            this.authConfig?.hid || getHardwareId(authOptions.systemId);
        this.baseSessionMetadata = {
            api_version: apiVersion,
            device_model: authOptions.controlCenterDisplayName ?? 'ring-client-api',
        };
    }
    getGrantData(twoFactorAuthCode) {
        if (this.authConfig?.rt && !twoFactorAuthCode) {
            return {
                grant_type: 'refresh_token',
                refresh_token: this.authConfig.rt,
            };
        }
        const { authOptions } = this;
        if ('email' in authOptions) {
            return {
                grant_type: 'password',
                password: authOptions.password,
                username: authOptions.email,
            };
        }
        throw new Error('Refresh token is not valid.  Unable to authenticate with Ring servers.  See https://github.com/dgreif/ring/wiki/Refresh-Tokens');
    }
    async getAuth(twoFactorAuthCode) {
        const grantData = this.getGrantData(twoFactorAuthCode);
        try {
            const hardwareId = await this.hardwareIdPromise, response = await requestWithRetry({
                url: 'https://oauth.ring.com/oauth/token',
                json: {
                    client_id: 'ring_official_android',
                    scope: 'client',
                    ...grantData,
                },
                method: 'POST',
                headers: {
                    '2fa-support': 'true',
                    '2fa-code': twoFactorAuthCode || '',
                    hardware_id: hardwareId,
                    'User-Agent': 'android:com.ringapp',
                },
            }), oldRefreshToken = this.refreshToken;
            // Store the new refresh token and auth config
            this.authConfig = {
                ...this.authConfig,
                rt: response.refresh_token,
                hid: hardwareId,
            };
            this.refreshToken = toBase64(JSON.stringify(this.authConfig));
            // Emit an event with the new token
            this.onRefreshTokenUpdated.next({
                oldRefreshToken,
                newRefreshToken: this.refreshToken,
            });
            return {
                ...response,
                // Override the refresh token in the response so that consumers of this data get the wrapped version
                refresh_token: this.refreshToken,
            };
        }
        catch (requestError) {
            if (grantData.refresh_token) {
                // failed request with refresh token
                this.refreshToken = undefined;
                this.authConfig = undefined;
                logError(requestError);
                return this.getAuth();
            }
            const response = requestError.response || {}, responseData = response.body || {}, responseError = 'error' in responseData && typeof responseData.error === 'string'
                ? responseData.error
                : '';
            if (response.status === 412 || // need 2fa code
                (response.status === 400 &&
                    responseError.startsWith('Verification Code')) // invalid 2fa code entered
            ) {
                this.using2fa = true;
                if (response.status === 400) {
                    this.promptFor2fa = 'Invalid 2fa code entered.  Please try again.';
                    throw new Error(responseError);
                }
                if ('tsv_state' in responseData) {
                    const { tsv_state, phone } = responseData, prompt = tsv_state === 'totp'
                        ? 'from your authenticator app'
                        : `sent to ${phone} via ${tsv_state}`;
                    this.promptFor2fa = `Please enter the code ${prompt}`;
                }
                else {
                    this.promptFor2fa = 'Please enter the code sent to your text/email';
                }
                throw new Error('Your Ring account is configured to use 2-factor authentication (2fa).  See https://github.com/dgreif/ring/wiki/Refresh-Tokens for details.');
            }
            const authTypeMessage = 'refreshToken' in this.authOptions
                ? 'refresh token is'
                : 'email and password are', errorMessage = 'Failed to fetch oauth token from Ring. ' +
                ('error_description' in responseData &&
                    responseData.error_description ===
                        'too many requests from dependency service'
                    ? 'You have requested too many 2fa codes.  Ring limits 2fa to 10 codes within 10 minutes.  Please try again in 10 minutes.'
                    : `Verify that your ${authTypeMessage} correct.`) +
                ` (error: ${responseError})`;
            logError(requestError.response || requestError);
            logError(errorMessage);
            throw new Error(errorMessage);
        }
    }
    async fetchNewSession(authToken) {
        return requestWithRetry({
            url: clientApi('session'),
            json: {
                device: {
                    hardware_id: await this.hardwareIdPromise,
                    metadata: this.baseSessionMetadata,
                    os: 'android', // can use android, ios, ring-site, windows for sure
                },
            },
            method: 'POST',
            headers: {
                authorization: `Bearer ${authToken.access_token}`,
            },
        });
    }
    getSession() {
        return this.authPromise.then(async (authToken) => {
            try {
                const session = await this.fetchNewSession(authToken);
                this.onSession.next(session);
                return session;
            }
            catch (e) {
                const response = e.response || {};
                if (response.status === 401) {
                    await this.refreshAuth();
                    return this.getSession();
                }
                if (response.status === 429) {
                    const retryAfter = e.response.headers.get('retry-after'), waitSeconds = isNaN(retryAfter)
                        ? 200
                        : Number.parseInt(retryAfter, 10);
                    logError(`Session response rate limited. Waiting to retry after ${waitSeconds} seconds`);
                    await delay((waitSeconds + 1) * 1000);
                    logInfo('Retrying session request');
                    return this.getSession();
                }
                throw e;
            }
        });
    }
    async refreshAuth() {
        this.clearPreviousAuth();
        await this.authPromise;
    }
    refreshSession() {
        this.sessionPromise = this.getSession();
        this.sessionPromise
            .finally(() => {
            // Refresh the session every 12 hours
            // This is needed to keep the session alive for users outside the US, due to Data Residency laws
            // We believe Ring is clearing the session info after ~24 hours, which breaks Push Notifications
            const timeout = setTimeout(() => {
                this.refreshSession();
            }, 12 * 60 * 60 * 1000); // 12 hours
            this.timeouts.push(timeout);
        })
            .catch((e) => logError(e));
    }
    async request(options) {
        const hardwareId = await this.hardwareIdPromise, url = options.url, initialSessionPromise = this.sessionPromise;
        try {
            await initialSessionPromise;
            const authTokenResponse = await this.authPromise;
            return await requestWithRetry({
                ...options,
                headers: {
                    ...options.headers,
                    authorization: `Bearer ${authTokenResponse.access_token}`,
                    hardware_id: hardwareId,
                    'User-Agent': 'android:com.ringapp',
                },
            });
        }
        catch (e) {
            const response = e.response || {};
            if (response.status === 401) {
                await this.refreshAuth();
                return this.request(options);
            }
            if (response.status === 504) {
                // Gateway Timeout.  These should be recoverable, but wait a few seconds just to be on the safe side
                await delay(5000);
                return this.request(options);
            }
            if (response.status === 404 &&
                response.body &&
                Array.isArray(response.body.errors)) {
                const errors = response.body.errors, errorText = errors
                    .map((code) => ringErrorCodes[code])
                    .filter((x) => x)
                    .join(', ');
                if (errorText) {
                    logError(`http request failed.  ${url} returned errors: (${errorText}).  Trying again in 20 seconds`);
                    await delay(20000);
                    return this.request(options);
                }
                logError(`http request failed.  ${url} returned unknown errors: (${stringify(errors)}).`);
            }
            if (response.status === 404 && url.startsWith(clientApiBaseUrl)) {
                logError('404 from endpoint ' + url);
                if (response.body?.error?.includes(hardwareId)) {
                    logError('Session hardware_id not found.  Creating a new session and trying again.');
                    if (this.sessionPromise === initialSessionPromise) {
                        this.refreshSession();
                    }
                    return this.request(options);
                }
                throw new Error('Not found with response: ' + stringify(response.body));
            }
            if (response.status) {
                logError(`Request to ${url} failed with status ${response.status}. Response body: ${stringify(response.body)}`);
            }
            else if (!options.allowNoResponse) {
                logError(`Request to ${url} failed:`);
                logError(e);
            }
            throw e;
        }
    }
    getCurrentAuth() {
        return this.authPromise;
    }
    clearTimeouts() {
        this.timeouts.forEach(clearTimeout);
    }
    get _internalOnly_pushNotificationCredentials() {
        return this.authConfig?.pnc;
    }
    set _internalOnly_pushNotificationCredentials(credentials) {
        if (!this.refreshToken || !this.authConfig) {
            throw new Error('Cannot set push notification credentials without a refresh token');
        }
        const oldRefreshToken = this.refreshToken;
        this.authConfig = {
            ...this.authConfig,
            pnc: credentials,
        };
        // SOMEDAY: refactor the conversion from auth config to refresh token - DRY from above
        const newRefreshToken = toBase64(JSON.stringify(this.authConfig));
        if (newRefreshToken === oldRefreshToken) {
            // No change, so we don't need to emit an updated refresh token
            return;
        }
        // Save and emit the updated refresh token
        this.refreshToken = newRefreshToken;
        this.onRefreshTokenUpdated.next({
            oldRefreshToken,
            newRefreshToken,
        });
    }
}
