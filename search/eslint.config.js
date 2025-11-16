import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: './tsconfig.json',
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      // Unused variables and imports - ERROR
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // Floating promises - MUST await or explicitly void - ERROR
      '@typescript-eslint/no-floating-promises': [
        'error',
        {
          ignoreVoid: true, // Allow void somePromise()
          ignoreIIFE: false,
        },
      ],

      // Misused promises - ERROR
      '@typescript-eslint/no-misused-promises': [
        'error',
        {
          checksVoidReturn: {
            attributes: false, // Allow in JSX attributes
          },
        },
      ],

      // Require await in async functions - WARN
      '@typescript-eslint/require-await': 'warn',

      // No async functions that don't use await - WARN
      '@typescript-eslint/promise-function-async': 'off',

      // Prefer nullish coalescing - WARN
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',

      // Prefer optional chaining - WARN
      '@typescript-eslint/prefer-optional-chain': 'warn',

      // No unnecessary type assertion - ERROR
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',

      // Consistent type imports - WARN
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        {
          prefer: 'type-imports',
          fixStyle: 'inline-type-imports',
        },
      ],

      // No explicit any - WARN (not error, for gradual typing)
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      '.turbo/**',
      '*.config.js',
      '*.config.ts',
    ],
  },
];
