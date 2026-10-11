# MPC Project Memory

## Current Phase 2 auth state
Supabase Auth is the identity authority. The browser uses `@supabase/supabase-js` for email/password signup/login, email verification, official session refresh, logout, password reset, and password update. Express verifies Bearer access tokens with `supabase.auth.getUser(accessToken)` and uses a request-scoped caller-token client. No custom JWT, refresh cookie, demo username login, or fabricated identity is permitted.

Profile bootstrap is idempotent through the authenticated application flow using verified `auth.uid()`. Migration `0002_auth_profile_bootstrap` adds only the self-insert RLS policy; it does not create a database trigger.

## What this product does
MPC is a browser-based music production center. Users trigger and sequence audio pads in React using the Web Audio API; the Node/Express backend authenticates sessions and streams protected sample assets.

## Current stack (do not change without a reviewed ADR)
- Frontend: React 18 + TypeScript + Vite + Tailwind CSS
- Audio: Web Audio API + MediaPipe gesture input
- Backend: Node.js 22.22.0 + Express 4 + TypeScript/tsx
- Auth: Supabase Auth with browser-managed sessions and verified Bearer access tokens
- Storage: `SampleStorage` abstraction with local filesystem for development/tests and private Supabase Storage for staging/production
- Deployment: native Render Static Site frontend plus native Render Node Web Service backend; no Docker/nginx deployment dependency
- CI: GitHub Actions Semgrep workflow only

## Non-negotiable engineering rules
- Never commit secrets, credentials, private URLs, proprietary samples, or generated build output.
- Every authentication or authorization change must include negative tests; the server is the source of truth.
- Never accept a username or identity from an unauthenticated request as proof of identity.
- Never use fallback secrets in production. Required secrets must be validated at startup.
- Every persistent schema change must use a reviewed migration; do not edit production data by hand.
- Every audio access check must happen before file/object retrieval and must be tenant/resource scoped when multi-user features are introduced.
- Do not log tokens, cookies, passwords, raw authorization headers, private sample paths, or unnecessary personal data.
- Prefer a modular monolith and managed services until measured load requires another architecture.
- Add one focused feature per branch/PR. Do not push directly to `main`.
- Before calling work complete, run and show: `npm ci`, lint, typecheck, tests, build, dependency audit, and relevant security checks.
- Before calling work complete, list changed files, skipped/stubbed behavior, assumptions, and remaining risks.

## Required commands (until tooling is upgraded)
- Install: `npm ci`
- Frontend build/typecheck: `npm run build`
- Backend typecheck/build: `npm run build:server`
- Backend dev: `npm run server`
- Both dev servers: `npm run dev:all`
- Dependency audit: `npm audit`
- Security scan: Semgrep GitHub Actions workflow

## Architecture direction
Use a modular monolith first. Keep route handlers thin and move identity/session, authorization, sample catalog, storage, and rate-limit policies into dedicated modules. Production should use a real identity/session persistence strategy and durable object storage; local filesystem storage is only for local development or an explicitly single-instance deployment.

## Working loop for every task
1. Ask for or write the plan before editing.
2. Work on a branch with a small, reviewable diff.
3. Write a failing regression test for security/behavior bugs before fixing them.
4. Implement only the approved slice.
5. Run focused tests, then the full verification command set.
6. Review the diff and inspect for secrets, debug endpoints, hard-coded deployment URLs, and accidental sample files.
7. Record material decisions in `docs/decisions/` and update this file.

## Key project risks currently known
See `docs/production-readiness-plan.md`. Do not describe the app as production-ready until the release-blocking findings and verification gates there are closed.

## Phase 5.7 status
The local Phase 5.7 implementation adds request-ID propagation, structured redacted request logs, bounded diagnostic counters, focused observability tests, a staging smoke-test entry point, and release/incident/backup/rollback runbooks. Phase 5.6 CI/staging/production workflows and ADRs 0006/0007 were recovered from retained local worktree history; the 26 tracked sample binaries were removed from the proposed working-tree diff without rewriting Git history. Provider alert configuration, staging end-to-end verification, an isolated database restore drill, a staging rollback rehearsal, and historical sample licensing/exposure review remain external gates and must be recorded as evidence before production readiness is claimed. See `docs/phase-5-7-readiness.md` and `docs/decisions/0008-phase-5-7-observability-and-operations.md`.
The staging deployment handoff now accepts only successful same-repository push CI runs on `main` or `master`, downloads an exact-SHA smoke artifact, and never checks out workflow-run code. Production verification disables checkout credential persistence and keeps production secrets in the separate protected deploy job. See `docs/decisions/0012-trusted-deployment-workflow.md`.

## Phase 5.8 preset audio 404 status
Staging currently has no `kit1`/`kit2` preset catalog rows; its one ready sample row has no preset kit/pad mapping. The backend now resolves aliases against the authenticated caller's organization-scoped database catalog in staging/production and limits the filesystem manifest to local/test. Do not claim playback is fixed: redistribution-cleared samples still need a private Storage/catalog import and successful post-deploy staging stream verification. No data was imported or deployment performed. See `docs/decisions/0013-staging-preset-alias-resolution.md`.
