# MPC Release Runbook

**Owner:** MPC maintainers
**Reviewed:** 2026-10-11
**Scope:** native Render Static Site frontend and Node Web Service backend. This is an operator procedure, not evidence that staging or production has been verified.

## Release gate

Do not deploy production unless the release SHA, CI checks, staging checks, migration compatibility, and operator approval are recorded. Never deploy from a dirty working tree.

Required local checks:

```text
npm ci
npm run lint
npm run build
npm run typecheck:server
npm run build:server
npm run test:auth
npm run test:api
npm audit --audit-level=high
git diff --check
```

Expected result: every command exits zero. A blocked provider, audit, or Semgrep check is recorded as **BLOCKED**, not passed.

## Release procedure

1. Record the candidate commit SHA with `git rev-parse HEAD`. Review `git status --short` and the diff.
2. Confirm `.github/workflows/ci.yml`, `.github/workflows/deploy-staging.yml`, `.github/workflows/deploy-production.yml`, the Semgrep workflow, and required repository checks are green. Workflow files are not proof that GitHub environment protection or provider configuration is active.
3. Confirm staging and production use separate Supabase projects, databases, storage buckets/prefixes, rate-limit namespaces, secrets, and Render services.
4. Review every migration for backward compatibility. Apply migrations only through the repository migration runner in the approved environment.
5. Deploy the candidate through the existing Render workflow or the Render service's controlled deploy action. Record the deploy event and resulting SHA.
6. Run the smoke test with dedicated staging fixtures:

   ```text
   STAGING_BASE_URL=https://<staging-backend>
   STAGING_ACCESS_TOKEN=<temporary-staging-token>
   STAGING_ORGANIZATION_ID=<staging-org>
   STAGING_SAMPLE_ID=<staging-sample>
   npm run test:staging-smoke
   ```

   Expected result: `PASS` for liveness, unauthenticated rejection, authenticated session, tenant-scoped project access, and authorized private audio. Missing fixtures produce `BLOCKED` and exit code 2.
7. Verify a uniquely named staging project can be created, read, updated, and read again after the update. Delete only that fixture through the supported API.
8. Verify sanitized logs contain the returned `X-Request-Id` and contain no bearer token, cookie, raw authorization header, or private storage key.
9. Review Render, Supabase, and Upstash provider signals. Record what was checked and what is unavailable.
10. Approve production only after all release prerequisites are green and the rollback target SHA is known-good.

## Failure handling

- Health or readiness failure: stop promotion; use `incident-response.md`.
- Authentication, tenant, or private-audio failure: stop promotion and preserve request IDs and sanitized logs.
- Migration failure: stop traffic promotion; do not run a destructive down migration by default. Follow `backups.md` and the migration owner’s forward-fix plan.
- Smoke-test exit code 2: staging evidence is incomplete; do not call the release verified.

## Evidence record

Record candidate SHA, previous known-good SHA, CI URLs, migration list, staging URL, smoke output, provider dashboard links, approver, deployment time, and rollback decision. Keep secrets and tokens out of the record.
