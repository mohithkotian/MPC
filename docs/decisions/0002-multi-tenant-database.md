# ADR 0002: Multi-tenant PostgreSQL database foundation

## Status

Accepted for Phase 1 implementation.

## Context

MPC currently has no application database. Authentication is still the existing demo JWT flow and is intentionally not changed in this phase. The next architecture must support users belonging to multiple organizations while preventing cross-organization access to sample metadata and future tenant-owned resources.

Supabase Auth remains the identity authority through `auth.users`. The application schema must store profiles, organizations, memberships, samples, and audit events without storing passwords or replacing Supabase identity.

## Decision

Use Supabase Postgres with these application tables:

- `public.profiles`, linked one-to-one to `auth.users`.
- `public.organizations`, the tenant boundary.
- `public.organization_members`, the user-to-organization role mapping.
- `public.samples`, metadata and private storage keys only.
- `public.audit_events`, security/business audit records.

Use UUID primary keys, UTC timestamps, foreign keys, explicit constraints, and indexes for tenant and membership lookups.

Enable Row Level Security on all five application tables. RLS policies use the authenticated Supabase user (`auth.uid()`) and active membership. RLS is defense-in-depth; the application repository also requires explicit organization scoping.

The server must derive authorization context from an authenticated user plus an active membership lookup. A client-provided organization ID is only a requested context and is never proof of authorization.

For normal user requests, the eventual Supabase data-access client should preserve the caller’s user context. A privileged database/migration connection must not be used as a substitute for authorization.

The Phase 1 raw `pg` repository layer is **not safe to use for authenticated production request authorization yet**. A native PostgreSQL connection does not automatically establish the request JWT identity or `auth.uid()` context. The current repository functions explicitly scope queries by a supplied context, but that context is not yet connected to verified request authentication. Phase 2 must explicitly implement the authenticated database access strategy before these repositories are used by production authenticated routes.

Development/test seed data is synthetic and refuses to run with `NODE_ENV=production`. Production migrations create schema and policies only; they never create users, organizations, memberships, or sample media.

## Alternatives considered

### Single-tenant schema

Rejected because the product is explicitly multi-organization and retrofitting tenant scope later would be risky.

### Organization ID supplied by request body

Rejected because request data is untrusted. The server must verify membership and derive the authorization context.

### Supabase service-role key for all backend queries

Rejected. It is not required for this foundation and would bypass RLS. If a future administrative operation needs it, that use must be isolated, server-only, and separately reviewed.

### RLS only, without application query scoping

Rejected. RLS is valuable defense-in-depth, but the service layer must still include explicit organization predicates and resource ownership checks.

### Raw PostgreSQL request context

The current `pg` pool/repository layer is intended for schema tooling and isolated tests only. It does not automatically pass a request JWT into PostgreSQL, so Supabase RLS cannot infer the authenticated user on those connections. Phase 2 must choose and implement one explicit authenticated access strategy, such as a Supabase user-token client or a rigorously designed request-scoped database context. Until then, the raw repository layer must not be wired into authenticated production request authorization.

### Fake production seed users

Rejected because it could create unauthorized accounts or test data in production.

### Database changes without reversible migrations

Rejected because schema changes must be reviewable, reproducible, and rollback-aware.

## Consequences

### Positive

- Tenant ownership is represented in the schema from the beginning.
- Membership and role queries have supporting indexes.
- RLS reduces the impact of accidental unscoped Supabase queries.
- Repositories can enforce organization scope before authentication is migrated.
- Production and test data remain clearly separated.

### Negative

- RLS policies and application authorization must be kept consistent.
- Multi-organization context must be resolved on organization-scoped requests.
- The initial schema assumes application profile rows are created after Supabase users exist; Phase 2 will define that lifecycle.
- Local plain PostgreSQL verification needs a small test-only `auth` compatibility bootstrap because Supabase’s `auth` schema/functions are not present in vanilla PostgreSQL.

## Security implications

- No passwords or auth secrets are stored in application tables.
- Tenant-owned queries must include `organization_id` from verified membership.
- Cross-organization lookups should return no row and later map to a non-enumerating 404.
- Sample `organization_id`, `uploaded_by`, and `storage_key` are immutable after creation through a database trigger.
- Audit metadata must not contain tokens, cookies, passwords, or private credentials.

## Testing strategy

Phase 1 verifies:

- clean migration and rollback on a disposable PostgreSQL database;
- RLS enabled on each application table;
- two synthetic organizations and users only in development/test;
- cross-organization SELECT/INSERT/UPDATE isolation;
- production refusal for the seed command;
- repository queries always scope sample reads by organization ID;
- existing frontend build remains successful.

## Rollback strategy

Run the reviewed down migration only against a disposable or explicitly approved non-production database. Before applying this migration to staging or production, create a database backup and rehearse restore. No sample media or production users are created by this Phase 1 change.
