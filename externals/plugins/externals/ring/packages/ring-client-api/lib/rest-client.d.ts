import type { AuthTokenResponse, SessionResponse } from './ring-types.ts';
import { ReplaySubject } from 'rxjs';
import type { Credentials } from '@eneris/push-receiver/dist/types.d.js';
import { Agent } from 'undici';
interface RequestOptions extends RequestInit {
    responseType?: 'json' | 'buffer';
    timeout?: number;
    json?: object;
    dispatcher?: Agent;
}
export declare function clientApi(path: string): string;
export declare function deviceApi(path: string): string;
export declare function commandsApi(path: string): string;
export declare function appApi(path: string): string;
export interface ExtendedResponse {
    responseTimestamp: number;
    timeMillis: number;
}
export interface EmailAuth {
    email: string;
    password: string;
    systemId?: string;
}
export interface RefreshTokenAuth {
    refreshToken: string;
    systemId?: string;
}
export interface SessionOptions {
    controlCenterDisplayName?: string;
}
export declare class RingRestClient {
    refreshToken: string | undefined;
    private authConfig;
    private hardwareIdPromise;
    private _authPromise;
    private timeouts;
    private clearPreviousAuth;
    private get authPromise();
    private sessionPromise?;
    using2fa: boolean;
    promptFor2fa?: string;
    onRefreshTokenUpdated: ReplaySubject<{
        oldRefreshToken?: string;
        newRefreshToken: string;
    }>;
    onSession: ReplaySubject<import("./ring-types.ts").ProfileResponse>;
    readonly baseSessionMetadata: {
        api_version: number;
        device_model: string;
    };
    private authOptions;
    constructor(authOptions: (EmailAuth | RefreshTokenAuth) & SessionOptions);
    private getGrantData;
    getAuth(twoFactorAuthCode?: string): Promise<AuthTokenResponse>;
    private fetchNewSession;
    getSession(): Promise<SessionResponse>;
    private refreshAuth;
    private refreshSession;
    request<T = void>(options: RequestOptions & {
        url: string;
        allowNoResponse?: boolean;
    }): Promise<T & ExtendedResponse>;
    getCurrentAuth(): Promise<AuthTokenResponse>;
    clearTimeouts(): void;
    get _internalOnly_pushNotificationCredentials(): Credentials | undefined;
    set _internalOnly_pushNotificationCredentials(credentials: Credentials | undefined);
}
export {};
