export const isCapacitor: boolean = typeof __CAPACITOR__ !== 'undefined' && __CAPACITOR__;

export async function showSplashScreen(): Promise<void> {
  if (!isCapacitor) return;
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.show({ autoHide: false, fadeInDuration: 0 });
  } catch {
    // the page change goes ahead without it
  }
}
