# ADR 0011: GitGuardian CI placeholder disposition

## Status

Remediated in the working tree; owner should mark both GitGuardian occurrences as false positives or resolved after the fix is pushed and rescanned. No credential rotation is required based on the evidence below.

## Findings

### Finding 1 — CI workflow service password

- GitGuardian incident: `38099281`, occurrence `303390214`
- Detector: `Generic Password`
- Reported commit: `570d6b856082f45e72b3d3319e04cd339990d9a9`
- File and line: `.github/workflows/ci.yml:21`
- Reported value: `mpc_ci`
- Use: `POSTGRES_PASSWORD` for the disposable `postgres:16-alpine` GitHub Actions service
- Matching database: `mpc_ci`, bound only to `127.0.0.1:5432` inside the CI job

### Finding 2 — production verification workflow service password

- GitGuardian incident: `38099281`, occurrence `303390215`
- Detector: `Generic Password`
- Reported commit: `570d6b856082f45e72b3d3319e04cd339990d9a9`
- File and line: `.github/workflows/deploy-production.yml:37`
- Reported value: `mpc_ci`
- Use: `POSTGRES_PASSWORD` for the disposable verification `postgres:16-alpine` service used before production approval
- Matching database: `mpc_ci`, bound only to `127.0.0.1:5432` in the verification job

## Evidence and disposition

Both occurrences are confirmed test-only placeholders, not production credentials:

- They appear only as environment values for disposable PostgreSQL services and their local test connection strings.
- The workflows use `ci.supabase.invalid`, localhost database binding, `NODE_ENV: test`, and a database named `mpc_ci`.
- No Supabase, Render, production database, storage, deployment-hook, or repository secret is assigned the value.
- Local Git history search found the literal only in the Phase 6 release-candidate workflow introduction, not in application configuration or production deployment settings.
- The two rows are separate occurrences of the same GitGuardian incident, not evidence of two distinct real credentials.

The current working-tree remediation replaces the hardcoded value in both workflows with:

```yaml
ci-${{ github.run_id }}-${{ github.run_attempt }}
```

The exact expression is used for both `POSTGRES_PASSWORD` and `TEST_DATABASE_URL` in each workflow, so every run gets a unique disposable value and the service/connection-string values match. No GitHub secret is required.

## Historical handling

The phase-6 branch history is being rewritten so the original workflow-introduction commit no longer contains the static test password. The replacement commit keeps the disposable PostgreSQL username/database unchanged and uses a unique per-run password; subsequent phase-6 changes are replayed on top. The original commit remains identified above for audit context, but is no longer part of the rewritten phase-6 branch ancestry once that branch update is published. GitHub may retain unreachable objects or copies may remain in existing clones/forks.

The reported value was confirmed to be synthetic test data and was never a production credential, so no credential rotation is warranted based on current evidence. After the rewritten branch is pushed and GitGuardian rescans the PR, verify that both occurrences clear and retain this evidence.

If later evidence shows that `mpc_ci` was reused as a real credential anywhere outside these disposable services, stop publication immediately, rotate the credential at its owning provider, inspect access logs, and reassess history cleanup. No such evidence is currently present.

## Scope boundary

This record does not authorize merging, deployment, repository visibility changes, Git-history rewriting, or suppression of future secret findings.
