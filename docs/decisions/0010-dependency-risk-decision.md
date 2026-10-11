# ADR 0010: Dependency audit risk decision

## Status

Pending owner approval. This record does not accept or waive any vulnerability.

## Current evidence

The resolved tree is:

```text
 tailwindcss@3.4.19
 ├─ chokidar@3.6.0 -> braces@3.0.3
 ├─ micromatch@4.0.8 -> braces@3.0.3
 ├─ postcss-nested@6.2.0 -> postcss-selector-parser@6.1.4
 └─ postcss-selector-parser@6.1.4
```

The latest successful native audit reported seven vulnerability paths: two moderate and five high.

### `braces`

- Advisory: GHSA-vfj7-8cjw-p6xm
- CVE: CVE-2026-93687
- Severity: High
- Affected: `<= 3.0.3`
- Patched release: none currently published
- Impact: deeply nested brace patterns can exhaust the call stack and terminate a Node.js process.
- Reachability: the package is in the Tailwind build/development dependency tree, not a direct MPC runtime import. The audit finding remains release-blocking until formally resolved or accepted.

### `postcss-selector-parser`

- Advisory: GHSA-rj75-hqrm-r3gf
- CVE: CVE-2026-104844
- Severity: Moderate
- Current: `6.1.4`
- Fixed: `7.1.6`
- Tailwind 3.4.19 declares `^6.1.2`.
- Impact: crafted flat selectors can cause quadratic CPU consumption.
- Reachability: Tailwind uses this during CSS processing; MPC does not expose a server-side selector parsing endpoint. A 7.x override is outside the declared compatibility range and was not verified.

The npm registry/advisory endpoint is currently returning `EACCES`, so no new package installation or post-change audit could be completed.

## Decision options

### Option A: Keep the gate open — recommended default

Keep Tailwind 3 and the current lockfile unchanged. Do not add an override, suppress the audit, or run `npm audit fix --force`. Revisit when Tailwind 3 or the affected packages provide a compatible remediation.

### Option B: Explicit time-bounded risk acceptance

The owner may explicitly accept the remaining findings for a defined release scope and expiry date after reviewing reachability, build isolation, and compensating controls. The acceptance must identify an owner, rationale, expiry, monitoring, and remediation trigger. This option does not make the audit pass and does not remove the production-readiness requirement unless the project security policy permits it.

### Option C: Reviewed dependency migration

Evaluate a compatible Tailwind 3-era replacement or a controlled migration path. Any package or override change must be implemented only after registry access is restored, compatibility is established, `npm ci` succeeds, and the relevant build/tests/audit pass. Tailwind CSS 4 is outside the current authorization.

## Recommendation

Select **Option A** unless the owner explicitly approves a documented, time-bounded risk acceptance under the project security policy. No dependency or lockfile change is authorized by this record.

## Required approval fields

- Decision: `OPEN`
- Owner: `TBD`
- Scope: `TBD`
- Expiry/review date: `TBD`
- Compensating controls: `TBD`
- Remediation trigger: `TBD`

## Scope boundary

This ADR is documentation only. It does not change dependencies, lockfiles, CI gates, Git history, repository visibility, or deployment state.
