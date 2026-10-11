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
7. staging smoke authentication regression tests;
8. `npm audit --omit=dev --audit-level=high`.

The existing Semgrep workflow remains a separate required security check. Repository administrators must make both the CI workflow and Semgrep workflow required status checks before merging or deploying.

The database test harness drops and recreates schemas. CI points it only at the disposable PostgreSQL service container through `TEST_DATABASE_URL`; it must never receive staging or production `DATABASE_URL` values.

## Node.js runtime contract

The locked `@supabase/auth-js@2.117.3` dependency requires Node.js `>=22.0.0`. CI and both deployment workflows use Node.js `22.22.0`; the repository `.node-version` file pins native Render/local selection to that version, while the `package.json` engine range (`>=22.0.0 <25.0.0`) also permits the verified local Node.js 24 runtime. Configure `NODE_VERSION=22.22.0` for both Render services, or verify that the service uses the repository `.node-version` file. Render advises using an explicit bounded version rather than an unbounded range.

## Staging deployment

`deploy-staging.yml` runs only after a successful CI workflow on a same-repository push to `main` or `master`. It uses the GitHub `staging` environment, validates all required settings before calling either Render deploy hook, waits for `GET /api/ready`, and runs the smoke script from the exact-SHA artifact. The `staging` environment must remain restricted to the `main` branch; do not put staging secrets in repository-level secrets or variables.

Before use, create a dedicated Supabase Auth test account in the staging Supabase project. Use a non-production mailbox/password, verify the account, and grant it membership with project-write permission in the configured staging organization. Ensure `STAGING_SAMPLE_ID` identifies a ready private sample in that same organization and the test account is authorized to stream it. Do not grant service-role access or reuse a human/production account.

At runtime, the smoke script signs in with the test account through Supabase Auth password sign-in using the staging anon/publishable key. It masks the returned access token immediately, keeps it only in process memory, never logs or persists it, and does not request or use a service-role key or refresh token. It verifies the Supabase user identity, the backend-verified identity, membership in `STAGING_ORGANIZATION_ID`, inclusion of `STAGING_SAMPLE_ID` in that organization's sample manifest, and successful authorized sample streaming. It also verifies liveness, readiness, unauthenticated rejection, missing-sample 404 behavior, and create/list/update/delete project behavior. Cleanup is scoped to the uniquely named project created by the smoke test.

A missing hook, URL, anon key, test-account credential, organization, or sample ID fails before either Render hook is called. The read-only pre-deployment check also authenticates the test account and verifies its backend identity, organization membership, sample-manifest membership, and sample streaming access. Invalid credentials, an expired session, missing organization membership, or inaccessible sample therefore blocks deployment. The post-deployment smoke test repeats these checks and runs the project lifecycle checks. Critical checks are never silently skipped.

## Production deployment and approval

`deploy-production.yml` is manually dispatched with an explicit release SHA. It first requires successful completed CI and Semgrep workflow runs for that exact SHA, then repeats install, build, tests, disposable database tests, and high-severity audit before the deploy job. The deploy job targets the protected GitHub `production` environment, which must require human reviewers before its secrets become available.

Production is not deployed by this task. Environment protection is not enforceable by this repository alone; administrators must configure the `production` environment reviewers and branch restrictions in GitHub. A workflow file existing without those settings is not sufficient approval control.

## GitHub configuration

### Staging environment variables

Add these as variables on the GitHub `staging` environment:

- `STAGING_ORGANIZATION_ID`: dedicated staging smoke-test organization UUID.
- `STAGING_SAMPLE_ID`: ready private sample UUID in that organization.
- `STAGING_MISSING_SAMPLE_ID`: optional absent UUID; otherwise the script generates one.
- `STAGING_SMOKE_PROJECT`: optional name prefix.

### Staging environment secrets

- `RENDER_STAGING_BACKEND_DEPLOY_HOOK`
- `RENDER_STAGING_FRONTEND_DEPLOY_HOOK`
- `STAGING_BACKEND_URL`
- `STAGING_SUPABASE_URL`
- `STAGING_SUPABASE_ANON_KEY`: anon JWT key (`role: anon`) or a publishable key; never a service-role/secret key.
- `STAGING_TEST_USER_EMAIL`
- `STAGING_TEST_USER_PASSWORD`

### Production environment secrets

- `RENDER_PRODUCTION_BACKEND_DEPLOY_HOOK`
- `RENDER_PRODUCTION_FRONTEND_DEPLOY_HOOK`
- `PRODUCTION_BACKEND_URL`

Render hook URLs, Supabase credentials, Supabase URL/key, and test-account credentials must remain secrets on the `staging` environment. They must never be echoed, placed in repository variables, or committed to source. The previous static `STAGING_ACCESS_TOKEN` secret is obsolete and must be deleted if it exists. The smoke workflow does not use a long-lived access token.

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
