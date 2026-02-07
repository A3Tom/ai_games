# Phase 01 — Ticket 003: ESLint and Prettier Configuration

## Summary

Sets up ESLint 9.x with flat config format and Prettier 3.x for consistent code formatting across the Vue 3 + TypeScript project. Configures rules that enforce the project's coding standards, including the ban on `any` and `enum`. Adds `lint` and `format` scripts to `package.json`. After this ticket, `npm run lint` passes with zero errors on all existing files.

## Prerequisites

- **Ticket 001** must be complete. All ESLint and Prettier packages are already installed in `package.json` from Ticket 001.
- **Ticket 002** is recommended to be complete so that Tailwind-related files also pass lint, but it is not a hard prerequisite.

## Scope

**In scope:**

- ESLint 9.x flat config file (`eslint.config.js`) with TypeScript and Vue support
- Prettier configuration (`.prettierrc.json`)
- `lint` and `format` npm scripts added to `package.json`
- Fix any lint errors in existing files from Tickets 001–002

**Out of scope:**

- CI/CD lint integration — Phase 13 (GitHub Actions workflow)
- Pre-commit hooks (e.g., husky + lint-staged) — not in scope for v1
- Custom ESLint rules beyond what's needed for the coding standards

## Files

| File | Action | Description |
|------|--------|-------------|
| `app/eslint.config.js` | Create | ESLint 9 flat config with TypeScript + Vue rules |
| `app/.prettierrc.json` | Create | Prettier formatting configuration |
| `app/package.json` | Modify | Add `lint` and `format` scripts |

## Requirements

### `eslint.config.js`

Must use ESLint 9.x flat config format (exported array, not `.eslintrc`). Per `docs/03-CODING-STANDARDS.md` Section 1, the project uses ESLint 9.x.

Required configuration layers:

1. **`@eslint/js` recommended rules** — baseline JavaScript rules.
2. **`typescript-eslint` recommended rules** — TypeScript-specific rules. Must flag `any` usage as an error (per `docs/03-CODING-STANDARDS.md` Section 2.2 and `docs/04-AI-ASSISTANT-GUIDE.md` Section 2.1).
3. **`eslint-plugin-vue` with `flat/recommended`** — Vue-specific rules for `<script setup>` components.
4. **`eslint-config-prettier`** — disables ESLint rules that conflict with Prettier formatting (must be last in the config array).
5. **Vue file parser configuration** — `.vue` files must use the TypeScript parser within `<script setup lang="ts">` blocks.

```typescript
// Expected structure (the agent implements this):
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'
import eslintConfigPrettier from 'eslint-config-prettier'

export default [
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
    // Project-specific overrides
    rules: {
      // Enforce no `any` — per docs/03-CODING-STANDARDS.md Section 2.2
      '@typescript-eslint/no-explicit-any': 'error',
      // Allow unused vars prefixed with _ (common pattern for destructuring)
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
]
```

Key rules to enforce (from `docs/03-CODING-STANDARDS.md` and `docs/04-AI-ASSISTANT-GUIDE.md`):

| Rule | Severity | Rationale |
|------|----------|-----------|
| `@typescript-eslint/no-explicit-any` | error | No `any` allowed (Section 2.2) |
| `@typescript-eslint/no-unused-vars` | error | With `argsIgnorePattern: '^_'` |
| `vue/multi-word-component-names` | off or configured | Stub views like `App.vue` have single-word names |

The agent should include the `ignores` pattern to skip `dist/`, `node_modules/`, and any generated files:

```typescript
{
  ignores: ['dist/**', 'node_modules/**'],
}
```

### `.prettierrc.json`

```json
{
  "singleQuote": true,
  "semi": false,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

Key choices:
- `singleQuote: true` — standard Vue ecosystem convention.
- `semi: false` — no semicolons, common in Vue projects.
- `trailingComma: "all"` — reduces diff noise.
- `printWidth: 100` — reasonable line length for modern screens.

### `package.json` script additions

Add these scripts (merging with existing scripts, not replacing them):

```json
{
  "scripts": {
    "lint": "eslint .",
    "format": "prettier --write src/"
  }
}
```

The `lint` script lints all files in the project. The `format` script formats source files only (not config files, to avoid reformatting them unexpectedly).

### Fixing existing files

After creating the ESLint and Prettier configs, run `npm run lint` and `npm run format`. If any existing files from Tickets 001–002 have lint or formatting issues, fix them. All files must pass lint before this ticket is complete.

## Acceptance Criteria

- [ ] `npm run lint` completes with zero errors and zero warnings
- [ ] `npm run format` runs without errors
- [ ] `eslint.config.js` uses ESLint 9.x flat config format (exports an array)
- [ ] TypeScript files (`.ts`) are linted with TypeScript-specific rules
- [ ] Vue files (`.vue`) are linted with the TypeScript parser for `<script>` blocks
- [ ] The `@typescript-eslint/no-explicit-any` rule is set to `error`
- [ ] All existing project files (from Tickets 001 and 002) pass both lint and format checks

## Notes for the Agent

1. **Use `eslint.config.js` (flat config), not `.eslintrc.*`.** ESLint 9.x uses flat config by default. The file must use `.js` extension and `export default` syntax since `package.json` has `"type": "module"`.
2. **`eslint-config-prettier` must be the last entry** in the config array. It disables ESLint formatting rules so they don't conflict with Prettier.
3. **Vue files need special parser config.** The `eslint-plugin-vue` uses `vue-eslint-parser` as the outer parser, but TypeScript within `<script setup lang="ts">` needs `typescript-eslint/parser` as the inner parser. The `parserOptions.parser` setting handles this.
4. **Check import syntax for each package.** ESLint plugin/config packages may export differently. Verify the import works by running `npm run lint` after creating the config.
5. **Do not add rules for things TypeScript already catches.** The strict `tsconfig.json` from Ticket 001 already enforces `noUnusedLocals`, `noUnusedParameters`, etc. ESLint should complement, not duplicate.
6. **If `vue/multi-word-component-names` causes errors** for `App.vue` or other single-word names, either disable the rule or add exceptions. The project architecture uses single-word names for the root component.
7. Per `docs/03-CODING-STANDARDS.md` Section 2.2: No `enum` is allowed. The ESLint rule `no-restricted-syntax` can enforce this, but it's lower priority than the `any` ban since TypeScript itself doesn't flag enums. Consider adding it if straightforward.
8. **Run `prettier --write` on all existing source files** after configuring Prettier to ensure they conform. Then run `eslint --fix` for auto-fixable issues. Manually fix anything remaining.
