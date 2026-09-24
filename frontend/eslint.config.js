// ESLint flat config (D5) — กฎขั้นต่ำตามสไตล์ repo: 2-space, single quotes, semi
import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'

export default [
  js.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['src/**/*.{js,vue}'],
    rules: {
      indent: ['error', 2],
      quotes: ['error', 'single', { avoidEscape: true }],
      semi: ['error', 'never'],
    },
  },
  {
    // เทสจงใจใช้ Node `global` (stub fetch ฯลฯ) — ประกาศเป็น readonly แทน 17 disables
    files: ['src/__tests__/**/*.js'],
    languageOptions: {
      globals: {
        global: 'readonly',
      },
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
]
