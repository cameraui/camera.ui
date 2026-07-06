export const isCapacitor: boolean = typeof __CAPACITOR__ !== 'undefined' && __CAPACITOR__;

export const devLocalServer: string | null = typeof __DEV_LOCAL_SERVER__ !== 'undefined' && __DEV_LOCAL_SERVER__ ? __DEV_LOCAL_SERVER__ : null;
