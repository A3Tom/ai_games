import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'
import eslintConfigPrettier from 'eslint-config-prettier'

export default [
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  eslintConfigPrettier,
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },
  {
    rules: {
      // Enforce no `any` — per docs/03-CODING-STANDARDS.md Section 2.2
      '@typescript-eslint/no-explicit-any': 'error',
      // Allow unused vars prefixed with _ (common pattern for destructuring)
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // Allow single-word component names (e.g., App.vue)
      'vue/multi-word-component-names': 'off',
    },
  },
]
