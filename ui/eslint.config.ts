import stylistic from '@stylistic/eslint-plugin';
import skipFormatting from '@vue/eslint-config-prettier/skip-formatting';
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript';
import pluginVue from 'eslint-plugin-vue';

export default defineConfigWithVueTs(
  {
    name: 'app/files-to-lint',
    files: ['**/*.{ts,mts,tsx,vue}'],
  },
  {
    name: 'app/files-to-ignore',
    ignores: ['**/dist/**', '**/dist-ssr/**', '**/dist-mobile/**', '**/coverage/**', '**/dev-dist/**', '**/src/components/CuiVirtualScroller/**', '**/vite-plugins/**'],
  },
  ...pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,
  skipFormatting,
  stylistic.configs['disable-legacy'],
  stylistic.configs.customize({
    indent: 2,
    quotes: 'single',
    semi: true,
    commaDangle: 'always-multiline',
    jsx: false,
    arrowParens: true,
    braceStyle: '1tbs',
    blockSpacing: true,
    quoteProps: 'as-needed',
  }),
  {
    rules: {
      // TypeScript specific rules
      // '@typescript-eslint/consistent-type-imports': 'error',
      // '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/prefer-promise-reject-errors': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/no-unsafe-declaration-merging': 'off',
      '@typescript-eslint/prefer-for-of': 'off',
      '@typescript-eslint/prefer-find': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-redundant-type-constituents': 'off',
      '@typescript-eslint/no-namespace': 'off',
      '@stylistic/generator-star-spacing': ['error', { before: true, after: false }],

      // Stylistic specific rules
      '@stylistic/max-len': ['error', { code: 200, tabWidth: 2, ignorePattern: 'class="[^"]*"|url\\([^)]*\\)' }],
      '@stylistic/quotes': ['error', 'single', { avoidEscape: true }],
      '@stylistic/operator-linebreak': 'off',
      '@stylistic/comma-dangle': [
        'error',
        {
          arrays: 'always-multiline',
          objects: 'always-multiline',
          imports: 'always-multiline',
          exports: 'only-multiline',
          functions: 'always-multiline',
          enums: 'always-multiline',
          generics: 'always-multiline',
          tuples: 'always-multiline',
        },
      ],

      'vue/multi-word-component-names': 'off',
      'vue/first-attribute-linebreak': 'off',
      'vue/require-default-prop': 'off',
      'vue/no-v-html': 'off',

      semi: [1, 'always'],
      // quotes: ['error', 'single'],
      'comma-dangle': ['error', 'only-multiline'],
      'no-multiple-empty-lines': ['warn', { max: 1, maxEOF: 0 }],
      'eol-last': ['error', 'always'],
      'space-before-function-paren': ['error', { named: 'never' }],

      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'all',
          argsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      'no-case-declarations': 'off',
      'no-async-promise-executor': 'off',
      'no-control-regex': 'off',
    },
  },
);
