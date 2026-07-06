import jsLint from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import globals from 'globals';
import tsLint from 'typescript-eslint';

export default [
  {
    files: ['**/*.{js,mjs,cjs,ts,mts}'],
  },
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/public/**', '**/build/**', '**/bundle/**', '**/test/**', '**/wasm/**', '**/example/**'],
  },
  jsLint.configs.recommended,
  // ...tsLint.configs.recommended,
  ...tsLint.configs.recommendedTypeChecked,
  ...tsLint.configs.stylisticTypeChecked,
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
    languageOptions: {
      globals: { ...globals.node },
      parser: tsParser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },

    rules: {
      // TypeScript specific rules
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/await-thenable': 'error',
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
      '@stylistic/max-len': ['error', { code: 170, tabWidth: 2 }],
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
  {
    files: ['**/*.js', '**/*.cjs', '**/*.mjs', '*.d.ts', '*.config.ts'],
    ...tsLint.configs.disableTypeChecked,
  },
];
