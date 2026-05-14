module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  parser: 'vue-eslint-parser',
  parserOptions: {
    parser: '@typescript-eslint/parser',
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['vue', '@typescript-eslint'],
  extends: [
    'plugin:vue/vue3-recommended',
    'plugin:@typescript-eslint/recommended',
    './.eslintrc-auto-import.json',
  ],
  ignorePatterns: ['dist', 'node_modules', '*.d.ts', '.eslintrc-auto-import.json'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    'vue/multi-word-component-names': 'off',
    'vue/component-definition-name-casing': ['error', 'PascalCase'],
    'no-console': ['warn', { allow: ['warn', 'error'] }],
  },
};
