import { resolve } from 'node:path';
import AutoImport from 'unplugin-auto-import/vite';
import Icons from 'unplugin-icons/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [AutoImport({ imports: ['vue'], dts: false }), Icons({ compiler: 'vue3' })],
  define: {
    __CAPACITOR__: 'false',
    __UI_VERSION__: '"test"',
  },
  resolve: {
    alias: [
      { find: '@/ui', replacement: resolve(import.meta.dirname, './src') },
      { find: '@', replacement: resolve(import.meta.dirname, './src') },
      { find: '@shared', replacement: resolve(import.meta.dirname, '../shared') },
    ],
  },
  test: {
    include: ['src/**/__tests__/*.test.ts'],
    environment: 'node',
  },
});
