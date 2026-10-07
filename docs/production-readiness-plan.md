# MPC Production-Readiness Plan

**Repository reviewed:** `mohithkotian/MPC`  
**Review basis:** repository at commit `c5da9b8`, the supplied *Vibe Coding a Real SaaS: The 15-Layer Playbook*, a clean dependency install, a production build, and a controlled backend smoke test.

## Executive assessment

MPC is a promising browser audio application prototype, not a production SaaS backend yet. The frontend build succeeds and the current architecture is understandable: React/Vite serves the UI, nginx proxies `/api/*`, and Express resolves an opaque sample ID to a file outside the web root. However, the current authentication is demo authentication, not user authentication; sample storage is local and tracked in the repository; rate limiting is process-local; there are no database migrations, durable sessions, integration tests, or deploy gates; and a debug endpoint is publicly reachable.

**Launch decision: do not expose the current backend to the public internet as a real product until Phase 0 and the release-blocking items in this document are complete.** The existing design can remain a modular monolith. It does not need microservices or Kubernetes at this stage.

## What exists today

| Area | Current implementation | Production implication |
|---|---|---|
| UI | React 18, TypeScript, Vite, Tailwind | Good starting point; needs offline/error/accessibility testing |
| Audio | Web Audio API; samples fetched into browser memory | Server authorization protects delivery, but cannot prevent capture after playback |
| API | Express 4 with `/api/auth`, `/api/audio`, `/api/health` | Very small surface; needs versioned contracts, validation, error handling, and tests |
| Identity | `POST /api/auth/login` creates a user from optional request input | **Critical: anyone can impersonate any username; there is no password, email, or persistent identity** |
| Tokens | JWT access token plus JWT refresh cookie, both signed by one secret | Needs key separation, token rotation/revocation, issuer/audience validation, and persistent sessions |
| Storage | Local files plus JSON manifest | Does not survive normal multi-instance/container deployment; no ownership metadata or durable backup policy |
| Abuse controls | `express-rate-limit` and in-memory IP blocklist | Resets on deploy and does not coordinate across instances |
| Reverse proxy | nginx with a hard-coded Render backend hostname | Deployment URL is embedded in source; proxy and environment configuration are not portable |
| CI | Semgrep workflow | No lint, typecheck, unit/integration tests, build, dependency audit, or deploy workflow |
| Tests | Three ad-hoc HTTP scripts that expect a manually running server | Not a repeatable automated test suite |
| Secrets | Production checks `JWT_SECRET`, but encryption key has a deterministic fallback and JWT has a fallback outside production | Unsafe defaults; runtime configuration needs schema validation |

## Verification evidence from this review

- `npm ci --ignore-scripts` completed.
- `npm run build` completed successfully.
- `npm audit --omit=dev` reported 4 production dependency vulnerabilities in the installed tree: 1 critical and 3 moderate. The lockfile currently resolves `express` 4.22.2, `body-parser` 1.20.6, `proxy-addr` 2.0.7, and `qs` 6.15.3; rerun the audit in CI because advisories and transitive resolutions change.
- Controlled backend smoke test: `/api/health` returned `200`; `/api/auth/refresh` without a cookie returned `401`; `/api/auth/debug` returned `200` and exposed deployment/request details. The debug route must be removed or disabled outside local development.
- No working tree changes existed before the documentation files were added.

## Release-blocking findings

### P0 — fix before any public launch

1. **Replace demo login.** `server/routes/auth.ts` accepts an optional `username` and creates a new identity without credentials. Implement a real identity provider or a proven authentication library. Never trust client-supplied user IDs, roles, or usernames.
2. **Remove `/api/auth/debug`.** It reveals `NODE_ENV`, proxy headers, HTTPS detection, and cookie names. If diagnostics are needed, keep them local-only and return a minimal authenticated/admin-safe status.
3. **Remove secret fallbacks.** `server/config.ts` must fail fast when `JWT_SECRET`, an encryption key, and other production variables are absent or malformed. Use separate secrets for access signing and refresh/session protection; rotate them through the chosen platform’s secret manager.
4. **Protect credentials against CSRF and session abuse.** State-changing cookie-authenticated endpoints need a deliberate CSRF strategy, strict cookie settings, refresh-token rotation, revocation on logout, and bounded expiry. Do not add `SameSite=None` unless the deployment topology truly requires cross-site cookies.
5. **Remove proprietary/unlicensed sample files from Git.** The README says samples are not distributed, but the repository currently contains tracked files under `server/storage/samples/`. Confirm licensing, remove any files that cannot be distributed, rotate/clean history if necessary, and provide a documented local seeding/import process.
6. **Use durable private storage.** Store samples in private object storage or a persistent volume with backups. Keep only metadata and opaque object keys in the application database. Do not rely on a container filesystem for production assets.
7. **Prevent cross-user access at the data model level.** Introduce a sample catalog with owner/organization scope and enforce authorization in one service layer. Every sample manifest lookup and stream/download must be scoped to the authenticated principal.
8. **Add automated security tests.** At minimum test unauthenticated access, invalid/expired tokens, logout/revocation, malformed IDs, path traversal attempts, missing files, unauthorized sample access, rate limits, and replay/refresh behavior.

### P1 — fix before calling the system operationally ready

- Add runtime environment validation and remove hard-coded Render URLs from `vite.config.ts`, `nginx.conf`, and CSP configuration.
- Add `app.set('trust proxy', ...)` only for the known proxy topology and verify forwarded headers safely.
- Add Helmet/security headers at the application boundary; keep a deliberate CSP that permits camera access only if the gesture feature needs it. Remove obsolete `X-XSS-Protection`.
- Add request size limits, consistent JSON error responses, request IDs, structured redacted logs, and process-level error handling.
- Add graceful shutdown for SIGTERM/SIGINT and a real readiness/health strategy.
- Replace the in-memory rate limiter/blocklist with a shared store such as Redis/Upstash, keyed appropriately by IP, account, and authenticated subject. Return `Retry-After` consistently.
- Upgrade/patch dependencies as verified by `npm audit`, then pin and review lockfile changes.
- Add CI gates for install, lint, typecheck, unit tests, integration tests, security checks, audit, and build.
- Add staging with a separate database/storage/secrets set from production. Require manual approval for production deploys.

## Target backend architecture

Keep one deployable modular monolith until measured load proves otherwise:

```text
Browser / React
      |
      v
nginx or managed edge (TLS, static assets, request limits)
      |
      v
Express API
  |-- request context: requestId, auth subject, current tenant
  |-- auth/session module
  |-- authorization policy module
  |-- sample catalog service
  |-- storage adapter (local dev / S3-compatible production)
  |-- rate-limit adapter (memory local / Redis production)
  |-- health/readiness and structured logging
      |              |
      v              v
Postgres        Private object storage
(users, sessions,  (encrypted samples,
 samples, audit)    signed/authorized access)
```

The browser should never receive a filesystem path, encryption key, refresh token, or private service URL. For streaming, the simplest early production option is an authorization-checked backend stream from private object storage. If bandwidth becomes the bottleneck, switch to short-lived signed object URLs only after the authorization check; include the user/tenant and sample in the authorization decision, not merely possession of a URL.

## Ordered implementation plan

### Phase 0 — project memory and repository hygiene

Create one branch named `chore/production-baseline`. Keep `AGENTS.md` current (this plan adds it) and optionally copy it to `CLAUDE.md` if Claude Code is used. Add `docs/decisions/` and record all material decisions.

Before feature work, remove or quarantine tracked sample assets, scan the full Git history for secrets and proprietary files, replace hard-coded Render URLs with environment variables, and define local/staging/production configuration. Do not combine this with a large auth rewrite.

**Exit gate:** the repository can be cloned without private media; a missing required production variable prevents startup; no debug endpoint exists in production; `npm ci` is reproducible.

### Phase 1 — authentication and sessions

Choose one supported provider and document the decision. For a small team, a managed provider such as Clerk/Auth0/Supabase Auth is lower risk than maintaining password flows. If self-hosting identity is a firm requirement, use a well-maintained session/auth library and a database-backed session table; do not hand-roll password hashing.

Implement:

- signup/login/logout, email verification, password reset, and optional OAuth only if required;
- a stable user record and a server-created session; refresh-token rotation and revocation;
- `requireAuth` that derives identity from verified credentials only;
- a request context containing `userId` and, later, `organizationId`;
- generic login errors so account enumeration is not possible;
- no user/role values accepted from request bodies or JWT payloads without server validation.

**Exit gate:** a fresh user can authenticate; logout invalidates the session; replaying a rotated refresh token fails; protected routes return 401; no route can self-assign a role.

### Phase 2 — persistence and sample catalog

Use Postgres with migrations. A minimal initial schema should include `users`, `sessions`, `samples`, `sample_access` or an explicit organization relationship, and `audit_events`. Every resource has UUID `id`, timestamps, and a useful unique constraint. Every tenant-owned record has `organization_id`; every query includes that scope.

Store sample metadata such as `storage_key`, content type, byte size, checksum, kit ID, pad index, and status. Store no private sample bytes in Postgres. Use a storage interface with a local adapter for development and S3/R2-compatible adapter for production.

**Exit gate:** migrations and seed data run from a clean database; Org/User A cannot read B’s sample by changing an ID; private storage objects are inaccessible without an authorized request; restore instructions exist and have been tested.

### Phase 3 — API contract and backend boundaries

Version the API (`/api/v1/...` or document why versioning is deferred). Add Zod or an equivalent boundary validator. Define a single error shape, for example:

```json
{
  "error": {
    "code": "SAMPLE_NOT_FOUND",
    "message": "Sample not found",
    "requestId": "..."
  }
}
```

Keep route handlers thin: parse input, obtain request context, call a service, map the result to HTTP. Put sample lookup, authorization, storage access, and audit events in services. Add pagination to list endpoints. Add request body limits and reject unexpected fields.

**Exit gate:** malformed JSON/input returns a clean 400; every protected endpoint has explicit auth and authorization; every slow or external operation is measured and either bounded or moved to a job.

### Phase 4 — secure audio delivery

Keep the existing opaque-ID approach, but remove the JSON manifest as the authority for access. Read catalog metadata from the database and authorize before resolving the object key. Reject traversal and malformed identifiers at validation. Stream from the storage adapter; do not log absolute paths or sample names unnecessarily. Preserve `private, no-store` for protected audio unless a reviewed signed-URL/CDN design replaces it.

Use origin/referer checks only as defense in depth. They are not authentication because headers can be absent or manipulated by non-browser clients. Authentication and authorization must remain mandatory.

**Exit gate:** automated tests prove that a valid user can access an allowed sample, an invalid/expired session gets 401, another user/tenant gets a non-enumerating 404, invalid IDs cannot escape the storage prefix, and missing/corrupt objects fail safely.

### Phase 5 — abuse controls, observability, and operations

Move rate limiting to a shared store. Use stricter limits for login/refresh and a per-user/per-tenant limit for sample streaming. Configure `trust proxy` correctly so IP keys are not all the proxy’s IP. Return `Retry-After` and log only a request ID, route, status, and timing.

Add structured logs, error tracking, metrics for auth failures, stream success/error/bytes, rate-limit hits, storage failures, and latency. Add alerts for error rate, health failures, auth abuse, storage errors, and resource exhaustion. Document backup/restore, deployment, rollback, incident response, and key rotation.

**Exit gate:** limits continue working after redeploy and across two instances; an operator can find a failed request by request ID; a restore drill has been performed; rollback has been rehearsed.

### Phase 6 — CI/CD and staged deployment

Create local, staging, and production environments with separate secrets, storage prefixes, and databases. The pull-request pipeline should run:

```text
npm ci
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration  # real test database
npm audit --audit-level=high
semgrep scan --config=auto
npm run build
```

Use immutable image builds with `npm ci --omit=dev` in the runtime image, a non-root user, a `.dockerignore` that excludes env files and local samples, and a health check. Run migrations as a controlled deploy step before traffic switches. PR previews/staging may deploy automatically; production should require an approval step. Document rollback and backward-compatible migrations.

**Exit gate:** a deliberately failing test blocks a PR; staging and production are isolated; a production rollback can be executed from the runbook; the health endpoint is wired to the platform.

## Test strategy

The current `test*.mjs` files are smoke scripts, not a test suite. Replace them with a test runner such as Vitest plus Supertest (or an equivalent) and add Playwright only for critical browser flows.

| Layer | Must prove |
|---|---|
| Unit | token/session policy, ID validation, authorization policy, storage-key safety, rate-limit policy |
| Integration | every auth and audio endpoint against a real test database/storage adapter; 401/403/404 behavior; refresh rotation; cross-user access |
| End-to-end | first visit/auth, manifest load, pad/sample playback, refresh after expiry, logout, offline/network failure, camera permission fallback |
| Security | dependency audit, Semgrep, secret scan, path traversal, malformed input, security headers, CSP, CSRF strategy |
| Operational | health/readiness, SIGTERM shutdown, migration on clean DB, backup restore, rate limits across instances |

For every endpoint, test happy path, malformed input, missing auth, expired auth, unauthorized resource, missing resource, and dependency failure. Do not mock the authorization check or the database in integration tests; mock only external providers where a contract test covers the integration separately.

## Recommended docs to add next

- `docs/system-design.md`: users, roles, tenancy, core flows, data sensitivity, launch scope, non-functional targets.
- `docs/architecture.md`: component diagram, providers, costs, risks, and folder structure.
- `docs/permissions.md`: explicit role/action matrix.
- `docs/api-conventions.md`: validation, errors, status codes, pagination, request context.
- `docs/security/threat-model.md`: assets, entry points, OWASP risks, mitigations.
- `docs/runbooks/deploy.md`, `rollback.md`, `backups.md`, and `incident-response.md`.
- `docs/decisions/0001-auth-provider.md`, `0002-storage-provider.md`, `0003-session-strategy.md`, and `0004-deployment-topology.md`.

## Reusable vibe-coding prompts

Use these prompts one at a time on a branch. Ask the coding agent to plan first and not edit until the plan is approved.

### Baseline audit prompt

```text
Read AGENTS.md, README.md, and docs/production-readiness-plan.md. Do not write code yet.
Audit the MPC repository as a staff backend/security engineer. Report findings with file, line,
severity, exploit or failure scenario, and recommended fix. Focus on authentication,
authorization, secret handling, storage, path traversal, CSRF, rate limiting, proxy trust,
logging, Docker, CI, dependency risks, and tracked proprietary assets. Separate confirmed
findings from assumptions. Do not claim production readiness.
```

### Authentication replacement prompt

```text
Implement Phase 1 from docs/production-readiness-plan.md. First propose a plan and wait.
Replace the demo username-based login with the approved identity/session design. Never accept
identity, role, or organization from the client as authority. Add session persistence,
refresh rotation, logout revocation, expiry, generic auth errors, runtime configuration
validation, and integration tests for login, logout, expiry, replay, and protected routes.
Remove /api/auth/debug. Keep route handlers thin. Run lint, typecheck, the full test suite,
build, and dependency audit. Before saying done, list changed files, skipped work,
assumptions, and command output.
```

### Sample storage prompt

```text
Implement Phase 2 and Phase 4 for the sample catalog. Plan first and do not edit until the
plan is reviewed. Add migrations, a scoped sample model, a storage adapter with local and
S3-compatible implementations, private-by-default objects, authorization before object
resolution, safe identifiers, and non-enumerating cross-user errors. Add integration tests
for unauthorized access, traversal, wrong content type, missing object, and rate limits.
Do not commit audio assets or secrets. Show migration, seed, restore, and test evidence.
```

### Security review prompt

```text
Act as an independent reviewer who did not write the preceding changes. Read the diff and
run the repository. Do not fix anything yet. Audit for broken access control, CSRF, token
replay, insecure cookies, secret leakage, verbose logs, path traversal, unsafe proxy trust,
security headers/CSP, dependency vulnerabilities, rate-limit bypass, and Docker/runtime
misconfiguration. Produce a severity-ranked report with exact file and line references and
reproduction commands. A passing build is not evidence that security is correct.
```

### Completion gate prompt

```text
Before you say this MPC task is complete:
1. Run lint, typecheck, the full unit/integration test suite, build, dependency audit, and
   relevant security scans; show the output.
2. List every changed file and why.
3. List anything skipped, stubbed, mocked, hard-coded, or left local-only.
4. List assumptions I must confirm.
5. Verify there are no secrets, debug routes, private URLs, or unapproved media files.
6. Confirm the cross-user authorization tests and rollback/restore evidence.
Do not describe the work as complete if any test is failing, skipped without a documented
reason, or not actually run.
```

## Definition of production ready

MPC is production ready only when a real user identity is verified by a proven auth mechanism; sessions can be revoked; sample access is authorized server-side and scoped to the right owner/tenant; private assets are durable and backed up; required configuration fails closed; rate limits work across instances; CI blocks regressions; staging is isolated from production; logs and alerts support an incident; restore and rollback have been rehearsed; and the release checklist has evidence rather than descriptions.
