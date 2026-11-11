import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import AutoImport from 'unplugin-auto-import/vite';
import IconsResolver from 'unplugin-icons/resolver';
import Icons from 'unplugin-icons/vite';
import Components from 'unplugin-vue-components/vite';
import Markdown from 'unplugin-vue-markdown/vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

import { openvueResolvers } from './vite-plugins/openvueResolvers.js';
import { workerViteClientGuard } from './vite-plugins/workerViteClientGuard.js';

import type { ManifestOptions } from 'vite-plugin-pwa';

dotenv.config({ path: resolve(import.meta.dirname, '..', '.env.local'), quiet: true });
dotenv.config({ path: resolve(import.meta.dirname, '..', '.env'), quiet: true });

for (const key of ['AUTH_SERVICE_URL', 'BILLING_SERVICE_URL', 'CLOUD_SERVICE_URL', 'PROXY_SERVICE_URL', 'SHARE_SERVICE_URL', 'PROXY_TUNNEL_ENDPOINT']) {
  if (process.env[key] != null && process.env[`VITE_${key}`] == null) {
    process.env[`VITE_${key}`] = process.env[key];
  }
}

process.chdir(import.meta.dirname);

const API_PORT = parseInt(process.env.CAMERA_UI_PORT!);
const UI_PORT = parseInt(process.env.CAMERA_UI_UI_PORT!);
const IS_MOBILE = process.env.CAMERA_UI_MOBILE === '1';
const UI_VERSION: string = JSON.parse(readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf8')).version;

const processEnv = { ...process.env };
delete processEnv.Path;
delete processEnv.PATH;

const manifest: Partial<ManifestOptions> = {
  lang: 'en',
  dir: 'ltr',
  id: 'camera.ui',
  name: 'camera.ui',
  short_name: 'camera.ui',
  description: 'The local-first camera and NVR platform.',
  theme_color: '#F1F1F1',
  display: 'standalone',
  display_override: ['standalone'],
  protocol_handlers: [
    {
      protocol: 'web+cameras',
      url: '/cameras?type=%s',
    },
    {
      protocol: 'web+camview',
      url: '/camview?type=%s',
    },
    {
      protocol: 'web+recordings',
      url: '/recordings?type=%s',
    },
  ],
  background_color: '#F1F1F1',
  orientation: 'any',
  scope: '/',
  start_url: '/',
  icons: [
    {
      src: '/pwa/pwa-24x24.png',
      sizes: '24x24',
      type: 'image/png',
    },
    {
      src: '/pwa/pwa-36x36.png',
      sizes: '36x36',
      type: 'image/png',
    },
    {
      src: '/pwa/pwa-48x48.png',
      sizes: '48x48',
      type: 'image/png',
    },
    {
      src: '/pwa/pwa-50x50.png',
      sizes: '50x50',
      type: 'image/png',
    },
    {
      src: '/pwa/pwa-64x64.png',
      sizes: '64x64',
      type: 'image/png',
    },
    {
      src: '/pwa/pwa-72x72.png',
      sizes: '72x72',
      type: 'image/png',
    },
    {
      src: '/pwa/pwa-88x88.png',
      sizes: '88x88',
      type: 'image/png',
    },
    {
      src: '/pwa/pwa-96x96.png',
      sizes: '96x96',
      type: 'image/png',
    },
    {
      src: '/pwa/pwa-120x120.png',
      sizes: '120x120',
      type: 'image/png',
    },
    {
      src: '/pwa/pwa-144x144.png',
      sizes: '144x144',
      type: 'image/png',
    },
    {
      src: '/pwa/pwa-152x152.png',
      sizes: '152x152',
      type: 'image/png',
    },
    {
      src: '/pwa/pwa-167x167.png',
      sizes: '167x167',
      type: 'image/png',
    },
    {
      src: '/pwa/pwa-180x180.png',
      sizes: '180x180',
      type: 'image/png',
    },
    {
      src: '/pwa/pwa-192x192.png',
      sizes: '192x192',
      type: 'image/png',
    },
    {
      src: '/pwa/pwa-300x300.png',
      sizes: '300x300',
      type: 'image/png',
    },
    {
      src: '/pwa/pwa-1024x1024.png',
      sizes: '1024x1024',
      type: 'image/png',
    },
    {
      src: '/pwa/maskable-icon-512x512.png',
      sizes: '512x512',
      type: 'image/png',
    },
    {
      src: '/pwa/maskable-icon-512x512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'any',
    },
    {
      src: '/pwa/maskable-icon-512x512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    },
    {
      src: '/pwa/maskable-icon-620x300.png',
      sizes: '620x300',
      type: 'image/png',
    },
    {
      src: '/pwa/maskable-icon-1240x600.png',
      sizes: '1240x600',
      type: 'image/png',
    },
  ],
  screenshots: [
    {
      src: '/pwa/apple-splash-landscape-dark-1334x750.png',
      sizes: '1334x750',
      type: 'image/png',
      form_factor: 'wide',
      label: 'camera.ui',
    },
    {
      src: '/pwa/apple-splash-landscape-dark-1334x750.png',
      sizes: '1334x750',
      type: 'image/png',
      platform: 'ios',
      label: 'camera.ui',
    },
  ],
};

const stripPwaTagsForMobile = {
  name: 'camera-ui:strip-pwa-tags-for-mobile',
  apply: 'build' as const,
  transformIndexHtml(html: string): string {
    return html.replace(/[ \t]*<link\b[^>]*\/?>\s*\n?/gi, (tag) => {
      const isManifest = /\brel\s*=\s*"manifest"/i.test(tag);
      const isAppleSplash = /\brel\s*=\s*"apple-touch-startup-image"/i.test(tag);
      const isIcon = /\brel\s*=\s*"icon"/i.test(tag);
      const isPng = /\btype\s*=\s*"image\/png"/i.test(tag);
      if (isManifest || isAppleSplash || (isIcon && isPng)) return '';
      return tag;
    });
  },
};

export default defineConfig(({ command }) => ({
  root: resolve(import.meta.dirname),
  base: command === 'build' || IS_MOBILE ? './' : '/',
  envDir: resolve(import.meta.dirname, '..'),
  plugins: [
    ...(IS_MOBILE ? [stripPwaTagsForMobile] : []),
    workerViteClientGuard(UI_PORT),
    vue({
      include: [/\.vue$/, /\.md$/],
    }),
    Markdown({
      markdownItOptions: {
        html: true,
        breaks: true,
        linkify: true,
        typographer: true,
      },
      wrapperClasses: 'markdown-body',
    }),
    Icons({
      compiler: 'vue3',
    }),
    tailwindcss(),
    AutoImport({
      include: [/\.[tj]sx?$/, /\.vue$/, /\.vue\?vue/, /\.md$/],
      vueTemplate: true,
      eslintrc: {
        enabled: true,
        filepath: resolve(import.meta.dirname, '.eslintrc-auto-import.json'),
        globalsPropValue: true,
      },
      dirs: [
        resolve(import.meta.dirname, 'src/composables'),
        resolve(import.meta.dirname, 'src/composables/sockets'),
        resolve(import.meta.dirname, 'src/connection/composables'),
        resolve(import.meta.dirname, 'src/stores'),
      ],
      dts: resolve(import.meta.dirname, 'src', 'types', 'auto-imports.d.ts'),
      imports: [
        'vue',
        '@vueuse/core',
        'pinia',
        'vue-i18n',
        {
          '@camera.ui/browser': [
            'useCameraUi',
            'useCameraById',
            'useCoreManager',
            'useDeviceManager',
            'usePlugin',
            'useCameraStream',
            'useSnapshot',
            'useTerminal',
            'useTerminalSessions',
            'useCuiFullscreen',
            'useTabVisibility',
          ],
        },
        {
          '@tanstack/vue-query': ['useQuery', 'useMutation', 'useQueryClient'],
        },
        {
          'vue-router': ['useLink', 'useRoute', 'useRouter', 'onBeforeRouteLeave', 'onBeforeRouteUpdate', 'createRouter', 'createWebHistory', 'createWebHashHistory'],
        },
        {
          axios: [['default', 'axios']],
        },
        {
          from: 'vue',
          imports: ['App'],
          type: true,
        },
        {
          from: 'vue-router',
          imports: ['RouteRecordRaw'],
          type: true,
        },
      ],
    }),
    Components({
      extensions: ['vue', 'md'],
      include: [/\.vue$/, /\.vue\?vue/, /\.md$/],
      dts: resolve(import.meta.dirname, 'src', 'types', 'components.d.ts'),
      resolvers: [...openvueResolvers(), IconsResolver()],
    }),
    ...(IS_MOBILE
      ? []
      : [
          VitePWA({
            outDir: resolve(import.meta.dirname, '..', 'server', 'dist', 'interface'),
            buildBase: '/',
            scope: '/',
            injectRegister: null,
            registerType: 'prompt',
            manifestFilename: 'manifest.webmanifest',
            manifest: manifest,
            includeManifestIcons: false,
            devOptions: {
              enabled: process.env.NODE_ENV === 'development',
              suppressWarnings: true,
            },
            workbox: {
              cacheId: 'camera-ui',
              clientsClaim: true,
              cleanupOutdatedCaches: true,
              globPatterns: ['**/*.{js,css,html,ico,png,svg,json,vue,jpg,jpeg,mp4,txt,woff2,ttf}'],
              globIgnores: ['ha/**', 'pwa/apple-splash-*', 'pwa/maskable-icon-*', 'og-share.png', 'robots.txt'],
              navigateFallback: null,
              directoryIndex: null,
              runtimeCaching: [
                {
                  urlPattern: ({ request, url }) =>
                    request.mode === 'navigate' && !(navigator as any)?.onLine && !url.pathname.startsWith('/api') && !/[?&]session=/.test(url.search),
                  handler: 'NetworkOnly',
                  options: { precacheFallback: { fallbackURL: 'index.html' } },
                },
              ],
            },
          }),
        ]),
  ],
  define: {
    __CAPACITOR__: IS_MOBILE,
    __UI_VERSION__: JSON.stringify(UI_VERSION),
  },
  resolve: {
    dedupe: ['vue', 'openvue', '@openvue/core', '@openuxkit/utils', '@vueuse/core', 'vue-i18n', '@camera.ui/browser', '@camera.ui/logger', '@camera.ui/sdk'],
    alias: [
      ...(IS_MOBILE ? [{ find: 'virtual:pwa-register/vue', replacement: resolve(import.meta.dirname, './src/composables/pwa-register-stub.ts') }] : []),
      { find: /^firebase\/messaging$/, replacement: resolve(import.meta.dirname, './src/composables/firebase-messaging-stub.ts') },
      { find: '@/ui', replacement: resolve(import.meta.dirname, './src') },
      { find: '@', replacement: resolve(import.meta.dirname, './src') },
      { find: '@shared', replacement: resolve(import.meta.dirname, '../shared') },
      { find: /^@nats-io\/transport-node$/, replacement: resolve(import.meta.dirname, './node_modules/@camera.ui/rpc/dist/browser.js') },
      { find: /^@nats-io\/nats-core$/, replacement: resolve(import.meta.dirname, './node_modules/@camera.ui/rpc/externals/nats.js/core/src/mod.ts') },
      { find: /^@nats-io\/nats-core\/internal$/, replacement: resolve(import.meta.dirname, './node_modules/@camera.ui/rpc/externals/nats.js/core/src/internal_mod.ts') },
    ],
    extensions: ['.js', '.json', '.jsx', '.mjs', '.ts', '.tsx', '.vue'],
  },
  build: {
    chunkSizeWarningLimit: 500,
    sourcemap: false,
    emptyOutDir: true,
    outDir: IS_MOBILE ? resolve(import.meta.dirname, 'dist-mobile') : resolve(import.meta.dirname, '..', 'server', 'dist', 'interface'),
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
      },
      output: {
        format: 'es',
        codeSplitting: {
          groups: [
            {
              name: 'vendor-core',
              test: /node_modules[\\/](vue|@vue|vue-router|pinia|vue-i18n|@intlify|@vueuse|@capacitor[\\/]core)[\\/]|vite[\\/]preload-helper/,
              priority: 30,
            },
            { name: 'vendor-openvue', test: /node_modules[\\/](openvue|@openvue|@openuxkit)[\\/]/, priority: 20 },
            { name: 'vendor-ace', test: /node_modules[\\/]ace-builds[\\/]/, priority: 10 },
            { name: 'vendor-zod', test: /node_modules[\\/]zod[\\/]/, priority: 10 },
            { name: 'vendor-rpc', test: /nats\.js[\\/]core[\\/]|node_modules[\\/](@nats-io|msgpackr|tweetnacl)[\\/]/, priority: 10 },
            { name: 'vendor-xterm', test: /node_modules[\\/]@xterm[\\/]/, priority: 10 },
            { name: 'vendor-chart', test: /node_modules[\\/](chart\.js|@kurkle|vue-chartjs)[\\/]/, priority: 10 },
            { name: 'vendor-vueflow', test: /node_modules[\\/]@vue-flow[\\/]/, priority: 10 },
            { name: 'vendor-leaflet', test: /node_modules[\\/](leaflet|@vue-leaflet)[\\/]/, priority: 10 },
            { name: 'vendor-gridstack', test: /node_modules[\\/]gridstack[\\/]/, priority: 10 },
            { name: 'vendor-draggabilly', test: /node_modules[\\/]draggabilly[\\/]/, priority: 10 },
            { name: 'vendor-dnd', test: /node_modules[\\/](vue3-dnd|react-dnd[^\\/]*)[\\/]/, priority: 10 },
            { name: 'vendor-capacitor', test: /node_modules[\\/](@capacitor[^\\/]*|@capgo|@aparajita)[\\/]/, priority: 10 },
            { name: 'vendor-markdown', test: /node_modules[\\/](highlight\.js|markdown-it[^\\/]*)[\\/]/, priority: 10 },
            { name: 'vendor', test: /node_modules[\\/](?!@camera\.ui[\\/])/, priority: 5 },
            { name: 'vendor-cameraui', test: /node_modules[\\/]@camera\.ui[\\/]/, priority: 0 },
          ],
        },
      },
      onwarn(warning, defaultHandler) {
        if (warning.code === 'INVALID_ANNOTATION' && warning.id?.includes('/@vueuse/core/')) return;
        defaultHandler(warning);
      },
    },
  },
  publicDir: resolve(import.meta.dirname, 'public'),
  server: {
    port: UI_PORT,
    host: '0.0.0.0',
    allowedHosts: true,
    cors: {
      origin: '*',
    },
    proxy: {
      '/api': {
        target: `https://0.0.0.0:${API_PORT}`,
        secure: false,
      },
      '/api/socket.io': {
        target: `wss://0.0.0.0:${API_PORT}`,
        ws: true,
        secure: false,
      },
      '/api/proxy': {
        target: `wss://0.0.0.0:${API_PORT}`,
        ws: true,
        secure: false,
      },
      '/api/go2rtc': {
        target: `wss://0.0.0.0:${API_PORT}`,
        ws: true,
        secure: false,
      },
    },
  },
}));
