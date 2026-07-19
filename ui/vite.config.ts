import { PrimeVueResolver } from '@primevue/auto-import-resolver';
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

import { workerViteClientGuard } from './vite-plugins/workerViteClientGuard.js';

import type { ManifestOptions } from 'vite-plugin-pwa';

dotenv.config({ path: resolve(__dirname, '..', '.env.local'), quiet: true });
dotenv.config({ path: resolve(__dirname, '..', '.env'), quiet: true });

for (const key of ['AUTH_SERVICE_URL', 'BILLING_SERVICE_URL', 'CLOUD_SERVICE_URL', 'PROXY_SERVICE_URL', 'SHARE_SERVICE_URL', 'PROXY_TUNNEL_ENDPOINT']) {
  if (process.env[key] != null && process.env[`VITE_${key}`] == null) {
    process.env[`VITE_${key}`] = process.env[key];
  }
}

process.chdir(__dirname);

const API_PORT = parseInt(process.env.CAMERA_UI_PORT!);
const UI_PORT = parseInt(process.env.CAMERA_UI_UI_PORT!);
const IS_MOBILE = process.env.CAMERA_UI_MOBILE === '1';
const DEV_LOCAL_SERVER = process.env.CAMERA_UI_DEV_LOCAL_SERVER ?? '';
const UI_VERSION: string = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')).version;

const processEnv = { ...process.env };
delete processEnv.Path;
delete processEnv.PATH;

const manifest: Partial<ManifestOptions> = {
  lang: 'en',
  dir: 'ltr',
  id: 'camera.ui',
  name: 'camera.ui',
  short_name: 'camera.ui',
  description: 'The modern solution for professional video surveillance. Designed for maximum flexibility and user-friendliness',
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
  root: resolve(__dirname),
  base: command === 'build' || IS_MOBILE ? './' : '/',
  envDir: resolve(__dirname, '..'),
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
      include: [
        /\.[tj]sx?$/, // .ts, .tsx, .js, .jsx
        /\.vue$/,
        /\.vue\?vue/, // .vue
        /\.md$/, // .md
      ],
      vueTemplate: true,
      eslintrc: {
        enabled: true,
        filepath: resolve(__dirname, '.eslintrc-auto-import.json'),
        globalsPropValue: true,
      },
      dirs: [
        resolve(__dirname, 'src/composables'),
        resolve(__dirname, 'src/composables/sockets'),
        resolve(__dirname, 'src/connection/composables'),
        resolve(__dirname, 'src/stores'),
      ],
      dts: resolve(__dirname, 'src', 'types', 'auto-imports.d.ts'),
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
          axios: [
            // default imports
            ['default', 'axios'], // import { default as axios } from 'axios',
          ],
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
      dts: resolve(__dirname, 'src', 'types', 'components.d.ts'),
      resolvers: [PrimeVueResolver(), IconsResolver()],
    }),
    ...(IS_MOBILE
      ? []
      : [
          VitePWA({
            outDir: resolve(__dirname, '..', 'server', 'dist', 'interface'),
            injectRegister: null,
            registerType: 'prompt',
            manifestFilename: 'manifest.webmanifest',
            manifest: manifest,
            devOptions: {
              enabled: process.env.NODE_ENV === 'development',
              suppressWarnings: true,
            },
            workbox: {
              cacheId: 'camera-ui',
              clientsClaim: true,
              cleanupOutdatedCaches: true,
              globPatterns: ['**/*.{js,css,html,ico,png,svg,json,vue,jpg,jpeg,mp4,txt,woff2,ttf}'],
              navigateFallback: 'index.html',
              navigateFallbackAllowlist: [/^(?!\/api)/],
              navigateFallbackDenylist: [/[?&]session=/],
            },
          }),
        ]),
  ],
  define: {
    __CAPACITOR__: IS_MOBILE,
    __DEV_LOCAL_SERVER__: JSON.stringify(IS_MOBILE ? DEV_LOCAL_SERVER : ''),
    __UI_VERSION__: JSON.stringify(UI_VERSION),
  },
  resolve: {
    dedupe: ['vue', 'primevue', '@primevue/core', '@primeuix/utils', '@vueuse/core'],
    alias: [
      ...(IS_MOBILE ? [{ find: 'virtual:pwa-register/vue', replacement: resolve(__dirname, './src/composables/pwa-register-stub.ts') }] : []),
      { find: /^firebase\/messaging$/, replacement: resolve(__dirname, './src/composables/firebase-messaging-stub.ts') },
      { find: '@/ui', replacement: resolve(__dirname, './src') },
      { find: '@', replacement: resolve(__dirname, './src') },
      { find: '@shared', replacement: resolve(__dirname, '../shared') },
      { find: /^@nats-io\/transport-node$/, replacement: resolve(__dirname, './node_modules/@camera.ui/rpc/dist/browser.js') },
      { find: /^@nats-io\/nats-core$/, replacement: resolve(__dirname, './node_modules/@camera.ui/rpc/externals/nats.js/core/src/mod.ts') },
      { find: /^@nats-io\/nats-core\/internal$/, replacement: resolve(__dirname, './node_modules/@camera.ui/rpc/externals/nats.js/core/src/internal_mod.ts') },
    ],
    extensions: ['.js', '.json', '.jsx', '.mjs', '.ts', '.tsx', '.vue'],
  },
  build: {
    chunkSizeWarningLimit: 500,
    sourcemap: false,
    emptyOutDir: true,
    outDir: IS_MOBILE ? resolve(__dirname, 'dist-mobile') : resolve(__dirname, '..', 'server', 'dist', 'interface'),
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
      output: {
        format: 'es',
        manualChunks(id: string) {
          if (id.includes('node_modules')) {
            if (id.includes('/vue/') || id.includes('vue-router') || id.includes('pinia') || id.includes('vue-i18n') || id.includes('@vueuse')) return 'vendor-core';
            if (id.includes('primevue') || id.includes('@primevue') || id.includes('@primeuix')) return 'vendor-primevue';
            if (id.includes('ace-builds')) return 'vendor-ace';
            if (id.includes('zod')) return 'vendor-zod';
            if (id.includes('nats.js/core') || id.includes('@nats-io') || id.includes('msgpackr') || id.includes('tweetnacl')) return 'vendor-rpc';
            if (id.includes('@camera.ui')) return 'vendor-cameraui';
            if (id.includes('@xterm') || id.includes('xterm')) return 'vendor-xterm';
            if (id.includes('chart.js') || id.includes('@kurkle') || id.includes('vue-chartjs')) return 'vendor-chart';
            if (id.includes('@vue-flow')) return 'vendor-vueflow';
            if (id.includes('leaflet') || id.includes('vue-leaflet')) return 'vendor-leaflet';
            if (id.includes('gridstack')) return 'vendor-gridstack';
            if (id.includes('draggabilly')) return 'vendor-draggabilly';
            if (id.includes('vue3-dnd') || id.includes('react-dnd')) return 'vendor-dnd';
            if (id.includes('@capacitor') || id.includes('@capgo') || id.includes('@aparajita')) return 'vendor-capacitor';
            if (id.includes('highlight.js') || id.includes('markdown-it')) return 'vendor-markdown';
            return 'vendor';
          }
        },
      },
      onwarn(warning, defaultHandler) {
        if (warning.code === 'INVALID_ANNOTATION' && warning.id?.includes('/@vueuse/core/')) return;
        defaultHandler(warning);
      },
    },
  },
  publicDir: resolve(__dirname, 'public'),
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
