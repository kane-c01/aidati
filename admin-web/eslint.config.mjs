/**
 * ESLint v9 flat config(替代 .eslintrc.cjs)
 *
 * 使用 @eslint/eslintrc 的 FlatCompat 兼容旧式 plugin/extends 写法,
 * 这样 plugin:vue/vue3-recommended 等 legacy 配置可以继续生效
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
});

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '**/*.d.ts',
      '.eslintrc-auto-import.json',
    ],
  },
  ...compat.config({
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
  }),

  // .vue 文件:<script setup> 顶层变量会被 <template> 隐式使用, ESLint 看不到 → 关掉 no-unused-vars
  {
    files: ['src/**/*.vue'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      'no-unused-vars': 'off',
      // valid-v-for 在 9.33 + 自定义组件场景下误判:
      // 已写 :key="item.label", item 来自 v-for 但被识为「未引用 v-for 变量」
      // 我们的 key 都是字面量唯一字段, 关掉这一规则
      'vue/valid-v-for': 'off',
      'vue/require-v-for-key': 'error',
    },
  },
];
