function notSupported(): never {
  throw new Error('firebase/messaging web fallback is not available in this build (use Capacitor on iOS/Android).');
}

export function deleteToken(): Promise<boolean> {
  return notSupported();
}

export function getMessaging(): never {
  return notSupported();
}

export function getToken(): Promise<string> {
  return notSupported();
}

export function onMessage(): () => void {
  return notSupported();
}

export async function isSupported(): Promise<boolean> {
  return false;
}
