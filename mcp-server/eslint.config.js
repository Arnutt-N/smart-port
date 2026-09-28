// ESLint flat config — mirror สไตล์ repo: 2-space, single quotes, no semi
import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'tests/**/*.ts', 'scripts/**/*.mjs'],
    rules: {
      indent: ['error', 2],
      quotes: ['error', 'single', { avoidEscape: true }],
      semi: ['error', 'never'],
    },
  },
  {
    // scripts เป็น plain node .mjs — ประกาศ globals เอง (TS ไม่ต้องเพราะ tseslint ปิด no-undef ให้)
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
      },
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
]
