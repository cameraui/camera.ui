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
import { defineConfig } from 'vite';

import type { AtRule, Plugin as PostcssPlugin, Rule } from 'postcss';
import type { Plugin } from 'vite';

dotenv.config({ path: resolve(__dirname, '..', '.env.local'), quiet: true });
dotenv.config({ path: resolve(__dirname, '..', '.env'), quiet: true });

process.chdir(__dirname);

const UI_VERSION: string = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')).version;

const SCOPE = '.cui-ha';
const ROOT_SELECTOR = /^(:root|html|body|:host)(?![\w-])/;
// `html.dark-mode`, `:root[data-mode]`: the compound lives on the theme node inside the scope node
const ROOT_COMPOUND = /^(:root|html|body|:host)(?=[.[:])/;
const ROOT_SIZING_PROPS = /^(min-|max-)?(width|height)$|^overflow/;
const UNSCOPED_AT_RULES = /^(keyframes|-webkit-keyframes|font-face|property|page|counter-style)$/;
const scoped = new WeakSet<Rule>();

function scopeSelector(selector: string): string {
  const s = selector.trim();
  if (!s || s.startsWith(SCOPE)) return s;
  if (ROOT_COMPOUND.test(s)) return s.replace(ROOT_COMPOUND, `${SCOPE} `);
  if (ROOT_SELECTOR.test(s)) return s.replace(ROOT_SELECTOR, SCOPE);
  return `${SCOPE} ${s}`;
}

// the cards bundle shares HA's document: every rule is confined to .cui-ha mount nodes
function scopeToCards(): PostcssPlugin {
  return {
    postcssPlugin: 'cui-ha-scope',
    Rule(rule) {
      if (scoped.has(rule)) return;
      let parent = rule.parent;
      while (parent && parent.type !== 'root') {
        if (parent.type === 'atrule' && UNSCOPED_AT_RULES.test((parent as AtRule).name)) return;
        parent = parent.parent;
      }
      const rootSelectors = rule.selectors.filter((sel) => ROOT_SELECTOR.test(sel.trim()) && !ROOT_COMPOUND.test(sel.trim()));
      const others = rule.selectors.filter((sel) => !rootSelectors.includes(sel));
      if (rootSelectors.length) {
        // html/body rules size the app to the viewport (min-width: 100vw, min-height: 100dvh); the scope node
        // must not, it lives inside a card box. Colors and fonts stay.
        const rootRule = rule.clone({ selectors: [SCOPE] });
        rootRule.walkDecls((decl) => {
          if (ROOT_SIZING_PROPS.test(decl.prop)) decl.remove();
        });
        scoped.add(rootRule);
        rule.after(rootRule);
        if (!others.length) {
          rule.remove();
          return;
        }
        rule.selectors = others;
      }
      rule.selectors = [...new Set(rule.selectors.map(scopeSelector))];
      scoped.add(rule);
    },
  };
}

// the lib build extracts every SFC <style> (and @camera.ui/nvr's css) into a .css asset that Lovelace would
// never load; hand it to the entry chunk instead, styles.ts folds it into the adopted sheets
function inlineExtractedCss(): Plugin {
  return {
    name: 'cui-ha-inline-css',
    enforce: 'post',
    generateBundle(_options, bundle) {
      let css = '';
      for (const [fileName, item] of Object.entries(bundle)) {
        if (item.type !== 'asset' || !fileName.endsWith('.css')) continue;
        css += `${typeof item.source === 'string' ? item.source : new TextDecoder().decode(item.source)}\n`;
        delete bundle[fileName];
      }
      const entry = Object.values(bundle).find((item) => item.type === 'chunk' && item.isEntry);
      if (entry && entry.type === 'chunk') {
        entry.code = `globalThis.__CUI_HA_CSS__ = ${JSON.stringify(css)};\n${entry.code}`;
      }
    },
  };
}

export default defineConfig({
  root: resolve(__dirname),
  envDir: resolve(__dirname, '..'),
  plugins: [
    vue(),
    Icons({ compiler: 'vue3' }),
    tailwindcss(),
    AutoImport({
      include: [/\.[tj]sx?$/, /\.vue$/, /\.vue\?vue/],
      vueTemplate: true,
      dirs: [
        resolve(__dirname, 'src/composables'),
        resolve(__dirname, 'src/composables/sockets'),
        resolve(__dirname, 'src/connection/composables'),
        resolve(__dirname, 'src/stores'),
      ],
      dts: false,
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
        { '@tanstack/vue-query': ['useQuery', 'useMutation', 'useQueryClient'] },
        { 'vue-router': ['useLink', 'useRoute', 'useRouter', 'onBeforeRouteLeave', 'onBeforeRouteUpdate', 'createRouter', 'createWebHistory', 'createWebHashHistory'] },
        { axios: [['default', 'axios']] },
      ],
    }),
    Components({
      extensions: ['vue'],
      include: [/\.vue$/, /\.vue\?vue/],
      dts: false,
      resolvers: [PrimeVueResolver(), IconsResolver()],
    }),
    inlineExtractedCss(),
  ],
  css: {
    postcss: { plugins: [scopeToCards()] },
  },
  define: {
    __CAPACITOR__: false,
    __DEV_LOCAL_SERVER__: JSON.stringify(''),
    __UI_VERSION__: JSON.stringify(UI_VERSION),
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  resolve: {
    dedupe: ['vue', 'primevue', '@primevue/core', '@primeuix/utils', '@vueuse/core'],
    alias: [
      { find: 'virtual:pwa-register/vue', replacement: resolve(__dirname, './src/composables/pwa-register-stub.ts') },
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
    target: 'es2022',
    sourcemap: false,
    outDir: resolve(__dirname, '..', 'server', 'dist', 'interface', 'ha'),
    emptyOutDir: true,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 4000,
    lib: {
      entry: resolve(__dirname, 'src/ha/main.ts'),
      formats: ['es'],
      fileName: () => 'cameraui-cards.js',
    },
    rollupOptions: {
      onwarn(warning, defaultHandler) {
        if (warning.code === 'INVALID_ANNOTATION' && warning.id?.includes('/@vueuse/core/')) return;
        defaultHandler(warning);
      },
    },
  },
});
