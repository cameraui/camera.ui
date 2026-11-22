export interface VirtualDeviceChoice {
  deviceId: string | null;
  // set while "New device" is picked
  newName: string | null;
}

export interface CuiVirtualDeviceFieldProps {
  devices: { label: string; value: string }[];
}

export function isIncompleteChoice(choice: VirtualDeviceChoice): boolean {
  return choice.newName !== null && !choice.newName.trim();
}
