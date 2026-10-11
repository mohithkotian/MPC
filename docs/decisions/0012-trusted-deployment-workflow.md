# ADR 0012: Trusted deployment workflow handoff

## Status

Implemented locally; remote CI, Semgrep, and staging verification remain pending for the remediation commit.

## Problem

The staging workflow used `workflow_run` with privileged staging secrets and checked out `github.event.workflow_run.head_sha`. A pull-request CI run could therefore cause a privileged workflow to execute pull-request-controlled code. Semgrep reported this as `workflow-run-target-code-checkout`.

## Decision

Staging remains a `workflow_run` handoff, but it is now restricted to a successful CI run whose provenance is explicitly validated:

- the triggering workflow event must be `push`;
- the pushed branch must be `main` or `master`;
- both the workflow repository and head repository must equal the current repository;
- the CI conclusion must be `success`.

The staging workflow no longer checks out any revision. CI packages only `scripts/staging-smoke.mjs` and a `release-sha` file when CI itself was triggered by a push to `main` or `master`. Staging downloads the artifact from the exact triggering workflow run, verifies that the embedded SHA equals `workflow_run.head_sha`, and executes only that artifact from the runner temporary directory. Pull-request CI does not produce a staging artifact, and its workflow-run event fails the staging job condition.

The artifact actions are immutable SHA-pinned. Staging retains only `actions: read` and `contents: read` permissions, uses the protected `staging` environment, and keeps Render hooks and staging credentials unavailable to CI and pull-request workflows.

Production does not use `workflow_run`. Its manual verification job uses an explicitly supplied release SHA, requires successful CI and Semgrep for that SHA, has no production environment secrets, and now disables checkout credential persistence. Production deploy secrets remain confined to the protected deployment job, which does not check out or execute repository code.

## Security boundary

The trusted staging workflow executes only an artifact produced by a successful push-based CI run from the same repository and protected branch. No artifact from a pull-request event is accepted. The exact tested SHA is carried in and checked against the artifact before execution.

## Verification required

After publication of the remediation commit, verify that:

1. Semgrep no longer reports `workflow-run-target-code-checkout`.
2. CI succeeds through the audit gate or reports only the already documented dependency findings.
3. GitGuardian reports no new hardcoded credentials.
4. A trusted push to `main` or `master` produces the artifact and staging workflow validates its SHA.
5. A pull-request CI completion does not start staging deployment.

This ADR does not authorize merging, production deployment, secret changes, or Git-history rewriting.
