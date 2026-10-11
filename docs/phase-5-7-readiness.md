# MPC Phase 5.7 Readiness Assessment

**Assessment date:** 2026-10-11
**Release decision:** **Phase 5 remains NOT production-ready.**

This assessment separates local implementation evidence from staging/provider evidence. Runbooks and tests do not count as a real restore drill or rollback rehearsal.

## Implementation summary

Implemented locally:

- `X-Request-Id` generation/validation and response propagation for every Express request.
- JSON structured request-completion logs with timestamp, severity, bounded route label, status, duration, and request ID.
- Redaction of bearer tokens, credential-like fields, URLs, and Windows paths in application log context.
- Bounded in-process counters for HTTP volume/status class, security rejections, rate-limit rejections, and audio authorization rejection. These are local diagnostics, not a durable cross-instance metrics backend.
- Correlated auth, authorization, rate-limit, and storage failure events.
- Regression tests for request-ID propagation, redaction, and metric reset/labels.
- Staging smoke script and release, incident, backup/restore, and rollback runbooks.
- Phase 5.6 CI/staging/production workflows, ADRs 0006/0007, deployment runbook, `/api/ready`, and `test:staging-smoke` package script recovered from retained local worktree history.
- Current tracked sample binaries removed without rewriting Git history or adding replacement media.

## Phase 5.5/5.6 reconciliation

The current `main` checkout contains the database-authoritative sample catalog and protected storage implementation: migrations exist under `server/db/migrations/`, tenant-scoped sample authorization is in `server/routes/audio.ts`, and storage access is mediated by `server/storage/SampleStorage.ts`. The 26 MP3 files previously tracked under `server/storage/samples/` have now been removed from the proposed working tree and no replacement binaries were added. Git history shows those files were introduced by the initial secure-project commit (`31723a4`) and no deletion commit exists in the inspected refs; historical exposure therefore remains open.

The recovered Phase 5.6 implementation from retained local worktree history is now integrated as `.github/workflows/ci.yml`, `.github/workflows/deploy-staging.yml`, `.github/workflows/deploy-production.yml`, `docs/decisions/0006-ci-cd-staged-deployment.md`, `docs/decisions/0007-private-sample-catalog.md`, and `docs/runbooks/deploy.md`. The current smoke script preserves the Phase 5.7 blocked behavior while supporting the recovered workflow variables and project/audio lifecycle checks. Workflow files are local source-control evidence only; GitHub environment protection, Render hooks, staging fixtures, and live execution remain unverified. The Phase 5.7 decision remains correctly numbered `0008`.

## Evidence matrix

| Gate | Status | Evidence / blocker |
|---|---|---|
| Lint/typecheck | PASS | `npm run lint`, `npm run typecheck:server`, and `npm run build:server` passed after dependency recovery. |
| Frontend build | PASS (native PowerShell) | Native `npm run build` completed successfully through Vite; Vite emitted only a chunk-size warning for the 586.59 kB JavaScript chunk. The separate agent-shell Vite `EACCES` result was an execution-environment restriction. |
| Unit tests | PASS | `npm run test:auth` passed 5/5; observability passed 2/2; storage passed 10/10 with temporary synthetic fixtures; project validation passed 3/3. |
| HTTP API/project tests | PASS (native PowerShell) | Native `npm run test:api` passed 26/26 and `npm run test:project-api` passed 4/4, including authenticated preset audio streaming and project lifecycle tests. Earlier agent-shell localhost `EACCES` failures were runner restrictions, not application failures. |
| Dependency audit | FAIL / OPEN | Native `npm audit --audit-level=high` reported 7 vulnerability paths: 2 moderate and 5 high. The current tree resolves `braces@3.0.3` through Tailwind 3.4.19; the authoritative advisory has no patched `braces` release. `postcss-selector-parser@6.1.4` is fixed in 7.1.6, but Tailwind declares incompatible `^6.1.2`; the registry currently returns `EACCES`, so no override was made or verified. Tailwind 4 and `npm audit fix --force` remain unauthorized. See [ADR 0010](decisions/0010-dependency-risk-decision.md); no risk acceptance has been recorded. |
| Semgrep | PASS (remote committed SHA) | Public GitHub Actions evidence shows Semgrep run [38085627878](https://github.com/mohithkotian/MPC/actions/runs/38085627878) succeeded for committed SHA `73c21d91838c8547e3e33ae0c527aea840898261`. This does not cover the uncommitted local changes. |
| CI/CD workflow integration | BLOCKED for current implementation / PASS for local files | Remote `main` at SHA `73c21d9` contains only `.github/workflows/semgrep.yml`; the local CI, staging, and production workflows are uncommitted and therefore have no remote run evidence. Publication requires an explicitly authorized commit/push. |
| GitHub branch/environment protection | BLOCKED | Public branch-protection API returned `401 Requires authentication`; the public environments endpoint returned zero environments. The authenticated GitHub connector wrapper and native `gh` CLI were unavailable, so required checks, approval reviewers, and secret isolation could not be verified. |
| Staging deployment | BLOCKED | The authorized Supabase connector exposes an active `MPC-Staging` project, but no `STAGING_BASE_URL`, `STAGING_API_BASE`, or `STAGING_TOKEN` is present; no Render connector is available. The public Render homepage listed by repository metadata was not treated as authorized staging evidence. |
| Auth and authorization | PASS (local tests) / BLOCKED (staging) | Auth unit tests passed 5/5 and native HTTP API tests passed; live staging auth remains unverified. |
| Database/RLS verification | BLOCKED | Requires an isolated authorized database/test environment; no destructive staging/production test was run. |
| Project persistence | BLOCKED | Native local project API tests pass, but the required deployed staging fixture and smoke credentials are unavailable. |
| Private audio retrieval | PASS (local tests) / BLOCKED (staging) | Storage authorization/provider tests passed 10/10 with a temporary fixture and native API tests passed authenticated preset streaming; live private Supabase Storage retrieval remains unverified. |
| Shared rate limiting | BLOCKED | Provider-backed two-instance behavior requires Upstash/staging access; local counters are not proof of distributed behavior. |
| Request tracing and redaction | PASS | Redaction/metric tests passed 2/2 and native API tests passed request-ID propagation and readiness checks. |
| Backup/PITR configuration | BLOCKED | Supabase connector confirms active staging project `MPC-Staging` (`iuxuxosutupmgydycwhs`) but exposes no backup/PITR settings; no dashboard/provider backup evidence was available. |
| Real database restore drill | NOT RUN | No separate authorized recovery environment or provider restore operation was available; no restore was attempted over staging or production. |
| Real application rollback rehearsal | NOT RUN | Current implementation is uncommitted locally and no authorized staging deployment/rehearsal was available. |
| Incident/release procedures | PASS (documentation) | `docs/runbooks/release.md` and `docs/runbooks/incident-response.md` created; procedures are not deployment evidence. |
| Current sample source-control cleanup | PASS (proposed diff) | All 26 tracked MP3 paths are deleted in the working-tree diff and no MP3 files remain on disk; the index will stop listing them when the deletions are staged/accepted. Storage source and ignored-fixture behavior remain. |
| Historical sample-binary exposure assessment | FAIL / OPEN | Local history establishes 26 MP3s entered in `31723a4`; current GitHub metadata confirms the repository is public and has no declared license. Exact prior sharing window and asset licensing remain unknown. See [ADR 0009](decisions/0009-historical-sample-exposure.md); approved licensing review and any history cleanup are still required. |

## Alerts and provider configuration

No alert delivery was claimed. The authorized Supabase connector confirmed an active staging project but exposed no alert/PITR configuration; Render and Upstash connectors were unavailable. No actionable alert configuration or test delivery was verified. The in-process counters are not durable, scrapeable metrics and should not be treated as a production monitoring backend.

## Required operator actions

1. Triage and remediate the 7 reported npm audit vulnerabilities without using `npm audit fix --force`; review whether a compatible non-breaking dependency update is appropriate and rerun the audit.
2. Explicitly authorize publication of the reviewed local changes on a feature branch; only then can remote CI/CD runs cover the Phase 5.5–5.7 implementation.
3. Provide authorized staging URL/token/fixtures and run `npm run test:staging-smoke` with bounded temporary resources.
4. Verify GitHub required checks, protected environments, production reviewers, Render hooks, and secret isolation through authenticated administrator access.
5. Verify Supabase backup/PITR retention and perform an isolated restore drill, recording duration and validation results.
6. Rehearse application rollback in staging and record old/new SHAs and all smoke checks.
7. Configure and test provider alerts for API errors/latency, auth abuse, rate-limit/shared-store failures, database health, storage failures, readiness, and restarts.
8. Complete licensing review and, if required, an approved historical Git cleanup process before public launch; current working-tree removal does not remediate historical exposure.

Until these actions have evidence, the release gates are not satisfied.
