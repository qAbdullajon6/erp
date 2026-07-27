const expoConfig = require('eslint-config-expo/flat');
const tseslintPlugin = require('@typescript-eslint/eslint-plugin');
const { defineConfig, globalIgnores } = require('eslint/config');

module.exports = defineConfig([
  globalIgnores(['dist/**', '.expo/**', 'expo-env.d.ts']),
  expoConfig,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { '@typescript-eslint': tseslintPlugin },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
]);
