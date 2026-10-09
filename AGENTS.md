# MPC Project Memory

## Current Phase 2 auth state
Supabase Auth is the identity authority. The browser uses `@supabase/supabase-js` for email/password signup/login, email verification, official session refresh, logout, password reset, and password update. Express verifies Bearer access tokens with `supabase.auth.getUser(accessToken)` and uses a request-scoped caller-token client. No custom JWT, refresh cookie, demo username login, or fabricated identity is permitted.

Profile bootstrap is idempotent through the authenticated application flow using verified `auth.uid()`. Migration `0002_auth_profile_bootstrap` adds only the self-insert RLS policy; it does not create a database trigger.

## What this product does
MPC is a browser-based music production center. Users trigger and sequence audio pads in React using the Web Audio API; the Node/Express backend authenticates sessions and streams protected sample assets.

## Current stack (do not change without a reviewed ADR)
- Frontend: React 18 + TypeScript + Vite + Tailwind CSS
- Audio: Web Audio API + MediaPipe gesture input
- Backend: Node.js 20 + Express 4 + TypeScript/tsx
- Auth: Supabase Auth with browser-managed sessions and verified Bearer access tokens
- Storage: local filesystem under `server/storage/samples` plus `manifest.json`; no database/object-storage abstraction yet
- Deployment: separate Docker images for frontend/nginx and backend; current documentation targets Render
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
