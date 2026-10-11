# CI/CD and staged deployment runbook

## Scope and current evidence

This runbook describes Phase 5.6 automation for the native Render architecture:

- frontend: Render Static Site;
- backend: Render Node Web Service;
- database/auth/storage: environment-specific Supabase projects and private storage configuration.

The workflows are configuration, not deployment evidence. No staging or production deployment is performed by this task. The local Windows environment has known npm, Vite filesystem, audit-network, and localhost-socket limitations, so GitHub-hosted Linux execution is the verification authority.

## Required CI checks

`.github/workflows/ci.yml` runs on pull requests, pushes to `main`/`master`, and manual dispatch. It uses `npm ci` and fails closed on:

1. lint/frontend typecheck;
2. frontend build;
3. backend typecheck and build;
4. authentication tests;
5. API, project, storage, configuration, and security tests;
6. disposable PostgreSQL migration/RLS tests;
7. `npm audit --audit-level=high`.

The existing Semgrep workflow remains a separate required security check. Repository administrators must make both the CI workflow and Semgrep workflow required status checks before merging or deploying.

The database test harness drops and recreates schemas. CI points it only at the disposable PostgreSQL service container through `TEST_DATABASE_URL`; it must never receive staging or production `DATABASE_URL` values.

## Node.js runtime contract

The locked `@supabase/auth-js@2.117.3` dependency requires Node.js `>=22.0.0`. CI and both deployment workflows use Node.js `22.22.0`; the repository `.node-version` file pins native Render/local selection to that version, while the `package.json` engine range (`>=22.0.0 <25.0.0`) also permits the verified local Node.js 24 runtime. Configure `NODE_VERSION=22.22.0` for both Render services, or verify that the service uses the repository `.node-version` file. Render advises using an explicit bounded version rather than an unbounded range.

## Staging deployment

`deploy-staging.yml` runs only after a successful CI workflow on `main` or `master`. It uses the protected GitHub `staging` environment, triggers the separate backend and frontend Render deploy hooks, waits for `GET /api/ready`, and runs `npm run test:staging-smoke`.

The smoke test requires a dedicated staging test account, organization, ready sample fixture, and access token. It verifies liveness, readiness, unauthenticated rejection, authenticated session, missing-sample 404 behavior, authorized private audio retrieval with at most 64 KiB consumed, and create/list/update/delete project behavior. Cleanup is scoped to the uniquely named project created by the smoke test.

A missing hook, URL, token, organization, or sample ID fails the workflow. Critical checks are never silently skipped.

## Production deployment and approval

`deploy-production.yml` is manually dispatched with an explicit release SHA. It first requires successful completed CI and Semgrep workflow runs for that exact SHA, then repeats install, build, tests, disposable database tests, and high-severity audit before the deploy job. The deploy job targets the protected GitHub `production` environment, which must require human reviewers before its secrets become available.

Production is not deployed by this task. Environment protection is not enforceable by this repository alone; administrators must configure the `production` environment reviewers and branch restrictions in GitHub. A workflow file existing without those settings is not sufficient approval control.

## GitHub configuration

### Repository variables

- `STAGING_ORGANIZATION_ID`: dedicated staging smoke-test organization UUID.
- `STAGING_SAMPLE_ID`: dedicated ready staging sample UUID.
- `STAGING_MISSING_SAMPLE_ID`: optional dedicated absent UUID; otherwise the script generates one.
- `STAGING_SMOKE_PROJECT`: optional name prefix.

### Staging environment secrets

- `RENDER_STAGING_BACKEND_DEPLOY_HOOK`
- `RENDER_STAGING_FRONTEND_DEPLOY_HOOK`
- `STAGING_BACKEND_URL`
- `STAGING_ACCESS_TOKEN`

### Production environment secrets

- `RENDER_PRODUCTION_BACKEND_DEPLOY_HOOK`
- `RENDER_PRODUCTION_FRONTEND_DEPLOY_HOOK`
- `PRODUCTION_BACKEND_URL`

Render hook URLs and tokens must remain environment secrets. They must never be echoed, placed in repository variables, or committed to source.

## Render service contract

Frontend Static Site:

- build: `npm ci && npm run build`;
- publish directory: `dist`;
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_BASE` as public/build-time configuration;
- SPA rewrite `/*` to `/index.html` with status `200`.

Backend Node Web Service:

- build: `npm ci && npm run build:server`;
- start: `npm run server`;
- health check: `GET /api/health`;
- readiness check: `GET /api/ready`;
- staging/production `NODE_ENV`, Supabase, private storage, sample-policy, encryption, and exact `ALLOWED_ORIGINS` variables.

Staging and production must use different Supabase projects, databases, storage buckets/prefixes, credentials, and GitHub environments.

## Failure investigation and rollback

1. Inspect the failed GitHub job without printing secret values.
2. Check Render service deploy logs and `/api/ready` response.
3. Check the staging smoke-test response status and request phase.
4. If a release is unhealthy, stop promotion; do not rerun against production blindly.
5. Use the Render dashboard’s documented rollback to the last known-good revision after the operator confirms the target revision. A rollback rehearsal remains a separate release gate and has not been performed by this task.
6. Record the incident and follow `docs/runbooks/backups.md` or `docs/runbooks/rollback.md` as appropriate; the procedures exist, but no live restore drill or rollback rehearsal is claimed by this task.

## Manual steps remaining

Branch protection, required status checks, protected-environment reviewers, Render service IDs/settings, deploy hooks, staging fixtures, Supabase isolation, backup/restore drills, and rollback rehearsal require repository/provider administrator action. They have not been verified from this local worktree.
