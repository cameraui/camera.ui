export { axiosInstance } from './client.js';
export { isAxiosError, isRemoteDisabledError, isServerGoneError, isTunnelPendingError } from './errors.js';
export { installApiErrorHandling } from './interceptors.js';
export { bridgeConnectionToQueryOnline } from './onlineBridge.js';

export interface AckResponse {
  data: {};
}
