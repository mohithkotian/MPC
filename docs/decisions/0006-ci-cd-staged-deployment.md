# ADR 0006: CI gates and protected staged deployment

- **Status:** Accepted for workflow implementation
- **Date:** 2026-10-11
- **Scope:** Phase 5.6 only

## Decision

Use GitHub Actions as the verification and promotion coordinator for the existing native Render frontend/backend deployment. Pull requests and mainline pushes run reproducible Linux CI with `npm ci`, typecheck/build gates, auth/API/storage tests, disposable PostgreSQL migration/RLS tests, and a high-severity dependency audit. Semgrep remains an independent required security workflow.

Staging deploys only after successful CI and use a protected staging environment, separate Render deploy hooks, readiness polling, and a bounded smoke test against dedicated staging fixtures. Production is manually dispatched for an explicit release SHA and uses a protected `production` environment requiring administrator-configured human reviewers before deploy secrets are available.

## Safety boundaries

The destructive database test harness runs only against a disposable PostgreSQL service container in CI. No workflow uses staging or production database URLs for that test. Deploy hooks and access tokens are GitHub environment secrets and are never printed. No workflow deploys during this task.

## Alternatives rejected

- Automatic production deployment from pull requests: rejected because production requires explicit approval and isolated credentials.
- Docker or a new hosting provider: rejected because the accepted deployment architecture is native Render.
- Silent smoke-test skips when fixtures are absent: rejected because missing critical staging prerequisites must fail visibly.
- Treating a local Windows pass as deployment evidence: rejected because CI is the authoritative Linux verification environment.

## Remaining operator controls

GitHub administrators must configure required status checks, protected environment reviewers, branch restrictions, Render service settings/hooks, separate Supabase environments, dedicated staging fixtures, and rollback/backup rehearsal. Workflow existence alone does not prove those controls are active.
