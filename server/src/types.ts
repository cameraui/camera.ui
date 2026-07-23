export type MethodKeys<T> = keyof {
  [K in keyof T as T[K] extends (...args: any) => any ? K : never]: any;
};

export type MethodType<T, K extends keyof T> = T[K] extends (...args: any) => any ? T[K] : never;

export type DeepPartial<T> = T extends object
  ? {
      [P in keyof T]?: DeepPartial<T[P]>;
    }
  : T;

export type FunctionPropertyNames<T> = {
  [K in keyof T]: T[K] extends Function ? K : never;
}[keyof T];

export type PartialReturnType<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => Promise<infer R>
    ? (...args: A) => Promise<R | undefined>
    : T[K] extends (...args: infer A) => infer R
      ? (...args: A) => R | undefined
      : T[K];
};

// from camera.ui service
export interface UpdateStartedMessage {
  type: 'UPDATE_STARTED';
  version: string;
}

export interface UpdateOutputMessage {
  type: 'UPDATE_OUTPUT';
  data: string;
}

export interface UpdateErrorMessage {
  type: 'UPDATE_ERROR';
  data: string;
}

export interface UpdateCompleteMessage {
  type: 'UPDATE_COMPLETE';
  version: string;
}

export interface UpdateFailedMessage {
  type: 'UPDATE_FAILED';
  error: string;
}

export type CLIMessage = UpdateStartedMessage | UpdateOutputMessage | UpdateErrorMessage | UpdateCompleteMessage | UpdateFailedMessage;

export interface AppUpdateAvailableMessage {
  type: 'APP_UPDATE_AVAILABLE';
  version: string;
}

export interface AppStartedMessage {
  type: 'STARTED';
  port: number;
}

export interface AppStoppingMessage {
  type: 'STOPPING';
}

export interface AppStartFailedMessage {
  type: 'START_ERROR';
  error: string;
}

export interface AppStartProgressMessage {
  type: 'START_OUTPUT';
  message: string;
}

export interface AppUpdateMessage {
  type: 'UPDATE_SERVER';
  version?: string;
}

export type IPCMessage = AppStartedMessage | AppStoppingMessage | AppStartFailedMessage | AppStartProgressMessage | AppUpdateMessage;
