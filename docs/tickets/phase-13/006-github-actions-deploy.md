# Phase 13 — Ticket 006: GitHub Actions Deploy Workflow

## Summary

Create the GitHub Actions workflow for automated deployment of the Vue SPA to GitHub Pages on push to `main`. This follows the exact specification from `docs/02-ARCHITECTURE.md` Section 6.4 and fulfills the deployment requirement from `docs/phases/phase-13-polish-deploy.md` Section 3. When done, the agent should have a working CI/CD workflow file that builds, validates, and deploys the app, plus verification that the production build succeeds and the bundle is within the performance budget.

## Prerequisites

- **Phases 1–12 complete.** The app builds successfully with `npm run build`.
- **Phase 1 complete.** `app/package.json`, `app/vite.config.ts`, and `app/tsconfig.json` exist.

Specific file dependencies:
- `app/package.json` — defines `build`, `type-check`, and `lint` scripts
- `app/vite.config.ts` — configures `base` for GitHub Pages

## Scope

**In scope:**

- Create `.github/workflows/deploy.yml` following the exact structure from `docs/02-ARCHITECTURE.md` Section 6.4
- Verify `npm run build` produces a production build with no errors
- Verify the gzipped JS bundle size is under 150 KB per `docs/02-ARCHITECTURE.md` Section 8

**Out of scope:**

- Caddyfile for relay deployment — Ticket 007
- Docker Compose changes — finalized in Phase 5
- Actually deploying to GitHub Pages — requires repository settings and secrets
- Lighthouse testing — requires a deployed site (manual post-deployment verification)
- Modifying `vite.config.ts` `base` setting — already configured in Phase 1

## Files

| File | Action | Description |
|------|--------|-------------|
| `.github/workflows/deploy.yml` | Create | GitHub Actions workflow for building and deploying SPA to GitHub Pages |

## Requirements

### Workflow Structure

The workflow must follow the exact specification from `docs/02-ARCHITECTURE.md` Section 6.4. Reproduce it precisely:

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: ./app
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: app/package-lock.json
      - run: npm ci
      - run: npm run type-check
      - run: npm run lint
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: app/dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

### Workflow Details

- **Trigger:** Push to `main` branch and manual `workflow_dispatch`
- **Permissions:** Read contents, write pages, write ID token (required for GitHub Pages deployment)
- **Concurrency:** Only one deployment at a time, cancel in-progress deployments
- **Build job:**
  - Working directory set to `./app` for all `run` steps
  - Node.js 20 with npm cache using `app/package-lock.json`
  - `npm ci` for clean dependency installation
  - `npm run type-check` — TypeScript compilation check
  - `npm run lint` — ESLint validation
  - `npm run build` — Vite production build
  - Upload `app/dist` as Pages artifact
- **Deploy job:**
  - Depends on build job
  - Uses `actions/deploy-pages@v4` for deployment
  - Outputs the deployed page URL

### Bundle Size Verification

After creating the workflow file, the agent should verify the production build locally:

1. Run `npm run build` in the `app/` directory
2. Check the output for the gzipped JS bundle size
3. Verify it is under 150 KB per `docs/02-ARCHITECTURE.md` Section 8

If the bundle exceeds 150 KB, note this as a warning but do not attempt to optimize — bundle optimization is outside the scope of this ticket.

## Acceptance Criteria

- [ ] File exists at `.github/workflows/deploy.yml`
- [ ] Workflow triggers on push to `main` and `workflow_dispatch`
- [ ] Workflow uses Node.js 20 with npm caching
- [ ] Build job runs `npm ci`, `npm run type-check`, `npm run lint`, `npm run build` in sequence
- [ ] Build job uploads `app/dist` as a Pages artifact
- [ ] Deploy job depends on build and uses `actions/deploy-pages@v4`
- [ ] `npm run build` executes successfully in `app/` directory
- [ ] `npm run type-check` passes with no errors
- [ ] `npm run lint` passes with no errors

## Notes for the Agent

- **Copy the workflow exactly from `docs/02-ARCHITECTURE.md` Section 6.4.** Do not deviate from the specified structure. The workflow has been designed to work with the project's monorepo layout (app in `./app` subdirectory).
- **Do not modify `vite.config.ts`.** The `base` setting for GitHub Pages was already configured in Phase 1. If you notice it's missing, note it but do not change it — it's outside this ticket's scope.
- **Do not modify `package.json` scripts.** The `build`, `type-check`, and `lint` scripts are already defined. If any are missing, note it as a blocker.
- **The `cache-dependency-path` is critical.** It must point to `app/package-lock.json` (not the root), since the monorepo has the SPA in a subdirectory. Without this, npm caching won't work.
- **The `working-directory: ./app` default** applies to all `run` steps in the build job. The `actions/upload-pages-artifact` step uses `path: app/dist` (relative to repo root) instead, because action `with` parameters are always relative to the repository root.
- **Verify the build works locally** by running `npm run build` in the `app/` directory. If it fails, investigate and fix any build issues (but do not modify game logic or components — only configuration if needed).
- **GitHub Pages deployment requires repository settings** (Pages source set to "GitHub Actions"). This ticket creates the workflow file; actual deployment activation is a manual step done in the GitHub repository settings.
