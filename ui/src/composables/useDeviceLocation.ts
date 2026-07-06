import { isCapacitor } from '@/connection/index.js';

export interface GeoCoords {
  latitude: number;
  longitude: number;
}

export function useDeviceLocation() {
  const getCurrentPosition = async (): Promise<GeoCoords> => {
    if (isCapacitor) {
      const { Geolocation } = await import('@capacitor/geolocation');
      const status = await Geolocation.requestPermissions({ permissions: ['location'] });
      if (status.location !== 'granted') {
        throw new Error('location permission denied');
      }
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10_000 });
      return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    }

    return new Promise<GeoCoords>((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('geolocation unavailable'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        (err) => reject(err),
        { enableHighAccuracy: true, timeout: 10_000 },
      );
    });
  };

  return { getCurrentPosition };
}
