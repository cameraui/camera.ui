import { createAppleSplashScreens, defineConfig } from '@vite-pwa/assets-generator/config';

import type { AppleDeviceName, AppleSplashScreens, AssetSize, AssetType, Favicon, Preset, ResolvedAssetSize } from '@vite-pwa/assets-generator/config';

type IconType = 'apple' | 'android' | 'windows' | 'optional' | 'maskable' | 'all';

export const logoPath = 'public/pwa/logo.svg';

export const generateAppleTouchIcons = (): AssetSize[] => {
  const appleTouchIcon = [180];
  return appleTouchIcon;
};

export const generateFavIcons = (): Favicon[] => {
  const favIconsSizes: Favicon[] = [
    [16, 'favicon-16.ico'],
    [32, 'favicon-32.ico'],
    [48, 'favicon-48.ico'],
    [64, 'favicon-64.ico'],
  ];
  return favIconsSizes;
};

export const generateIcons = (iconType: IconType | IconType[]): AssetSize[] => {
  const appleIconSizes = [120, 152, 167, 180, 1024];
  const androidIconSizes = [36, 48, 64, 72, 96, 144, 192];
  const optionalIconSizes = [512, { width: 620, height: 300 }, { width: 1240, height: 600 }]; // eg splashscreens
  const windowsIconSizes = [24, 48, 50, 88, 300];
  const maskableIconSizes = [512];

  if (typeof iconType === 'string') {
    iconType = [iconType];
  }

  const icons = new Set<AssetSize>();

  for (const type of iconType) {
    switch (type) {
      case 'apple':
        appleIconSizes.forEach((iconSize: AssetSize) => icons.add(iconSize));
        break;
      case 'android':
        androidIconSizes.forEach((iconSize: AssetSize) => icons.add(iconSize));
        break;
      case 'windows':
        windowsIconSizes.forEach((iconSize: AssetSize) => icons.add(iconSize));
        break;
      case 'optional':
        optionalIconSizes.forEach((iconSize: AssetSize) => icons.add(iconSize));
        break;
      case 'maskable':
        maskableIconSizes.forEach((iconSize: AssetSize) => icons.add(iconSize));
        break;
      case 'all':
        icons.clear();
        [...androidIconSizes, ...appleIconSizes, ...optionalIconSizes, ...maskableIconSizes, ...windowsIconSizes].forEach((iconSize) => icons.add(iconSize));
        break;
    }

    if (type === 'all') {
      break;
    }
  }

  return Array.from(icons);
};

export const generateAppleSplashScreens = (): AppleSplashScreens => {
  const deviceNames: AppleDeviceName[] = [
    'iPad Pro 12.9"',
    'iPad Pro 11"',
    'iPad Pro 10.5"',
    'iPad Pro 9.7"',
    'iPad mini 7.9"',
    'iPad Air 10.5"',
    'iPad Air 9.7"',
    'iPad 10.2"',
    'iPad 9.7"',
    'iPhone 14 Pro Max',
    'iPhone 14 Pro',
    'iPhone 14 Plus',
    'iPhone 14',
    'iPhone 13 Pro Max',
    'iPhone 13 Pro',
    'iPhone 13',
    'iPhone 13 mini',
    'iPhone 12 Pro Max',
    'iPhone 12 Pro',
    'iPhone 12',
    'iPhone 12 mini',
    'iPhone 11 Pro Max',
    'iPhone 11 Pro',
    'iPhone 11',
    'iPhone XS Max',
    'iPhone XS',
    'iPhone XR',
    'iPhone X',
    'iPhone 8 Plus',
    'iPhone 8',
    'iPhone 7 Plus',
    'iPhone 7',
    'iPhone 6s Plus',
    'iPhone 6s',
    'iPhone 6 Plus',
    'iPhone 6',
    'iPhone SE 4.7"',
    'iPhone SE 4"',
    'iPod touch 5th generation and later',
  ];

  return createAppleSplashScreens(
    {
      padding: 0.5,
      resizeOptions: { background: '#f1f1f1', fit: 'contain' },
      darkResizeOptions: { background: '#121212', fit: 'contain' },
      linkMediaOptions: {
        log: false,
        addMediaScreen: true,
        basePath: '/',
        xhtml: true,
      },
      png: {
        compressionLevel: 9,
        quality: 90,
      },
      name: (landscape, size, dark) => {
        return `apple-splash-${landscape ? 'landscape' : 'portrait'}-${typeof dark === 'boolean' ? (dark ? 'dark-' : 'light-') : ''}${size.width}x${size.height}.png`;
      },
    },
    deviceNames,
  );
};

export const defaultAssetName = (type: AssetType, size: ResolvedAssetSize): string => {
  switch (type) {
    case 'transparent':
      return `pwa-${size.width}x${size.height}.png`;
    case 'maskable':
      return `maskable-icon-${size.width}x${size.height}.png`;
    case 'apple':
      return `apple-touch-icon-${size.width}x${size.height}.png`;
  }
};

export const cameraUiPreset: Preset = {
  transparent: {
    sizes: generateIcons(['android', 'apple', 'windows']),
    favicons: generateFavIcons(),
    padding: 0.1,
  },
  maskable: {
    sizes: generateIcons(['maskable', 'optional']),
    resizeOptions: {
      fit: 'contain',
      background: '#121212',
    },
    padding: 0.1,
  },
  apple: {
    sizes: generateAppleTouchIcons(),
    resizeOptions: {
      fit: 'contain',
      background: '#121212',
    },
    padding: 0.1,
  },
  appleSplashScreens: generateAppleSplashScreens(),
};

export default defineConfig({
  root: '.',
  overrideAssets: true,
  logLevel: 'info',

  preset: {
    ...cameraUiPreset,
    assetName: (type: AssetType, size: ResolvedAssetSize) => defaultAssetName(type, size),
    png: {
      compressionLevel: 9,
      quality: 90,
    },
  },
  images: [logoPath],
});
