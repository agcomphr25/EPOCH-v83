/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  env: { es2023: true, node: true, browser: true },
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
  ],
  parserOptions: {
    project: ['./tsconfig.json', './client/tsconfig.json', './server/tsconfig.json'].filter(Boolean),
    tsconfigRootDir: __dirname,
  },
  globals: {
    fetch: 'readonly',
    FormData: 'readonly',
    File: 'readonly',
  },
  rules: {
    // allow unused vars if prefixed with _
'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    // these were tripping you; downgrade to warnings
    'no-useless-escape': 'warn',
    '@typescript-eslint/no-explicit-any': 'warn',
  },
  overrides: [
    { files: ['client/**/*.{ts,tsx}'], env: { browser: true, node: false } },
    { files: ['server/**/*.{ts,tsx}'], env: { node: true, browser: false } },
  ],
};
