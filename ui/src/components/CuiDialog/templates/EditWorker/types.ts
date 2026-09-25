import type { UsableNetworkAddress } from '@camera.ui/common/network';

export interface EditWorkerProps {
  currentName: string;
  addresses: UsableNetworkAddress[];
  serverAddresses: string[];
}

export interface EditWorkerResult {
  name: string;
  serverAddresses: string[];
}
