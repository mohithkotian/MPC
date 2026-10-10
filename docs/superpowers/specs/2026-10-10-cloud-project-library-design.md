# Cloud Project Library Design

**Status:** Approved for implementation
**Date:** 2026-10-10
**Branch:** `feature/cloud-project-library`

## Goal

Allow an authenticated MPC user to save, list, load, update, and soft-delete project snapshots from a tenant-scoped cloud library while retaining IndexedDB as a local fallback.

## User outcome

A verified user selects an organization, saves the current beat as a named project, sees their saved projects, and can reopen one after signing in on another browser. A user cannot read, update, or delete another user's project.

## Scope

- Add a reviewed Postgres migration for `public.projects`.
- Store project metadata and serializable MPC state in Postgres JSONB.
- Scope every request by verified Supabase user plus an active organization membership.
- Add protected project REST endpoints under `/api/projects`.
- Add frontend API access using the current Supabase access token.
- Update the existing Kits & Projects UI to use cloud projects, with IndexedDB fallback when cloud persistence is unavailable.
- Add negative tests for missing auth, invalid organization context, malformed IDs/data, and cross-user access.

## Explicit non-goals

- No collaboration or sharing permissions in this slice.
- No project version history or conflict-resolution UI.
- No cloud upload/synchronization of custom sample bytes. Runtime `AudioBuffer` and `customSamples` are never sent to the API. Existing local sample storage remains local until the sample-library phase.
- No new authentication mechanism, refresh token, organization creation flow, or billing.
- No migration of existing IndexedDB rows to the cloud automatically.

## Authorization model

- The organization is selected through `x-organization-id` on every project request.
- The header is a requested context only; the server verifies membership with the caller-token Supabase client.
- Projects are private to their `owner_id` in this phase. The owner must be `auth.uid()`; a member cannot impersonate another owner by changing request data.
- A project is visible only when all of these are true: authenticated caller, active membership in the requested organization, matching project organization, matching owner, and `deleted_at IS NULL`.
- Cross-user and cross-organization lookups return a non-enumerating `404`.
- The API never accepts user ID, role, or owner ID as authority.

## Data model

`public.projects`:

- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE`
- `owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT`
- `name TEXT NOT NULL` with trimmed length 1–120
- `artist TEXT NOT NULL DEFAULT ''` with length at most 120
- `bpm INTEGER NOT NULL` between 40 and 240
- `swing INTEGER NOT NULL DEFAULT 0` between 0 and 100
- `master_volume NUMERIC NOT NULL DEFAULT 0.85` between 0 and 1
- `active_bank TEXT NOT NULL` limited to `A`, `B`, `C`, or `D`
- `project_data JSONB NOT NULL` containing serializable banks and patterns only
- `created_at`, `updated_at`, `deleted_at`

Indexes cover `(organization_id, owner_id, updated_at DESC)` and active rows.

RLS is enabled. Select/insert/update/delete policies require an active organization member and `owner_id = auth.uid()`; insert additionally requires a non-viewer membership role. The database trigger from migration 0001 updates `updated_at`.

## API contract

All endpoints require `Authorization: Bearer <Supabase access token>` and `x-organization-id: <UUID>`.

### `GET /api/projects`

Returns the caller's active projects in the requested organization, newest update first, capped at 50:

```json
{"projects":[{"id":"...","name":"...","artist":"...","bpm":107,"swing":0,"masterVolume":0.85,"activeBank":"A","createdAt":"...","updatedAt":"...","data":{"banks":{},"patterns":{}}}]}
```

### `POST /api/projects`

Accepts a strict body containing `name`, `artist`, `bpm`, `swing`, `masterVolume`, `activeBank`, `banks`, and `patterns`. The server sets `organization_id` from the verified header context and `owner_id` from the verified token. Returns `201` with the created project.

### `GET /api/projects/:projectId`

Returns one project or `404` for malformed, missing, cross-user, or cross-organization resources.

### `PATCH /api/projects/:projectId`

Accepts the same project fields as `POST`, replaces the serializable snapshot, and returns the updated project. Only the owner can update it.

### `DELETE /api/projects/:projectId`

Soft-deletes the caller's project and returns `204`. Repeated or unauthorized deletion returns `404`.

Errors use the existing compact JSON convention for this slice: `{ "error": "..." }`; no tokens, private paths, or raw database errors are returned.

## Frontend behavior

- Add a small project API service that obtains the current Supabase session and sends the access token plus organization header.
- Add an active-organization selection seam using the first organization returned by `/api/me/organizations` for this slice. If no organization is available, cloud calls fail clearly and local IndexedDB remains usable.
- Serialize project state before sending: remove `audioBuffer`, omit `customSamples`, and retain pad metadata, patterns, and scalar controls.
- Load cloud projects in `KitBrowserModal`; if the cloud request fails, load IndexedDB projects and show a local-only status.
- Save to the cloud first; on cloud failure, save to IndexedDB and show that the project is local-only.
- Preserve preset-kit loading and existing local project APIs.

## Testing strategy

- Migration tests verify the projects table, constraints, indexes, RLS, and rollback behavior using the existing database test approach.
- API tests mock only the Supabase HTTP contract and verify request behavior: missing bearer, invalid organization header, missing membership, malformed project ID, cross-user `404`, owner CRUD, strict validation, and deleted-project `404`.
- Frontend/service unit tests cover serialization of runtime-only audio fields and cloud-to-local fallback.
- Full verification remains required: `npm ci`, lint, typecheck, focused tests, full tests, frontend build, backend build, `npm audit`, and relevant security checks.

## Assumptions and remaining risks

- The first organization returned by the existing organizations endpoint is the active organization until an organization switcher is designed.
- Supabase REST/RLS remains the authenticated data-access path; the raw `pg` repository layer is not used for request authorization.
- Cloud projects do not make local custom audio portable yet; that is intentionally deferred to the sample-library phase.
- Existing test fixtures may need small Supabase REST contract extensions for project table calls.
- Save a local safety snapshot, then synchronize to the cloud; on cloud failure, retain the local snapshot and show that the project is local-only.
