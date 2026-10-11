# MPC Phase 6.2 Release-Candidate Plan

## Current state

- Working tree: `C:\Users\Mohith\mpc`
- Current branch: `main`
- Current HEAD: `73c21d91838c8547e3e33ae0c527aea840898261`
- Release changes: local and uncommitted
- Git history: unchanged
- Repository visibility: unchanged
- MP3 files on disk: 0
- Proposed MP3 deletions: 26

This plan does not create a branch, commit, push, deploy, or rewrite history.

## Preconditions before publication

1. Resolve or explicitly approve the open dependency-risk decision in ADR 0010.
2. Establish licensing rights for the 26 historical MP3s, or explicitly approve the coordinated history-cleanup plan in ADR 0009.
3. Confirm the complete local diff contains only the reviewed Phase 5.5–5.7 implementation and documentation.
4. Ensure no staging or production credentials are present in the diff, commit message, or evidence record.
5. Obtain explicit authorization to create a feature branch, commit, and push.

## Local release-candidate review

Run without destructive Git operations:

```powershell
Set-Location C:\Users\Mohith\mpc
git status --short
git diff --check
git diff --stat
git diff -- package.json package-lock.json server docs .github scripts
git diff --name-status -- server/storage/samples
```

Confirm the release contains:

- Phase 5.5 private sample catalog, authorization, storage, and all 26 MP3 deletions.
- Phase 5.6 CI, staging, and production workflows.
- Phase 5.7 observability, request IDs, redaction, readiness, runbooks, and ADRs.
- Temporary synthetic test fixtures only in test-scoped temporary directories.
- No generated build output, secrets, proprietary audio, or unrelated files.

Previously passing local checks do not need to be repeated unless package files change:

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

The dependency audit is currently expected to remain open because `braces@3.0.3` has no patched upstream release and Tailwind 3 compatibility with `postcss-selector-parser@7.1.6` is unverified.

## Authorized publication sequence

After the owner explicitly authorizes publication:

1. Create a feature branch from the current reviewed base, using a project-approved name such as `phase-6-release-candidate`.
2. Preserve and review the existing dirty working tree; do not reset, clean, stash, or discard changes.
3. Stage only the reviewed release-candidate files, including the 26 MP3 deletions.
4. Review the staged diff and staged secret scan.
5. Create one release-candidate commit with the required Manus co-author trailer.
6. Push the feature branch to the configured GitHub remote.
7. Open or update a pull request targeting `main`.
8. Record the exact pushed commit SHA and workflow URLs.

## Remote verification

For the exact pushed SHA:

- CI must run through `.github/workflows/ci.yml` and pass install, lint, frontend build, backend typecheck/build, auth/API/project/storage tests, disposable database/RLS tests, and high-severity audit.
- Semgrep must run through `.github/workflows/semgrep.yml` and produce a successful SARIF upload.
- A feature-branch pull request triggers CI and Semgrep. A feature-branch push alone does not trigger their push paths because those paths are restricted to `main`/`master`.
- Do not treat workflow-file presence as evidence of successful execution.

## Staging promotion

The current staging workflow runs only after successful CI on `main`/`master`. After the authorized promotion path reaches the staging trigger:

1. Confirm protected `staging` environment reviewers and secrets are configured.
2. Trigger separate Render backend and frontend staging deploy hooks.
3. Wait for `GET /api/ready` to return ready.
4. Run `npm run test:staging-smoke` with temporary staging credentials and dedicated UUID fixtures.
5. Record request IDs, health/readiness results, auth, tenant isolation, project lifecycle, missing-sample behavior, and private audio results.
6. Delete only the uniquely created smoke project.

## Evidence required before production consideration

- Exact release SHA.
- Successful CI and Semgrep URLs for that SHA.
- Staging deploy and smoke evidence.
- Branch protection and protected-environment evidence.
- Provider alert configuration and test-delivery evidence.
- Isolated database restore-drill evidence.
- Staging rollback-rehearsal evidence.
- Dependency-risk decision and historical MP3 licensing/history decision.

Until those records exist, MPC remains not production-ready.
