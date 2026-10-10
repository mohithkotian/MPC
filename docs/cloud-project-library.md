# Cloud Project Library

## Architecture

```text
Browser → Supabase Auth → Express API → organization authorization
        → PostgreSQL projects → JSONB snapshot

IndexedDB remains the browser fallback. Audio files are not stored in project JSON;
custom uploaded audio remains local-only.
```

The browser sends a Supabase Bearer token and an `x-organization-id` context. Express verifies the token server-side, checks active membership, and never accepts `owner_id` or `organization_id` from a project body. PostgreSQL RLS and a trigger enforce the same organization/ownership boundaries.

## Data model and migration

Migration `0003_projects` creates `public.projects` with UUID identity, organization and owner scope, deterministic project metadata, JSONB snapshot, timestamps, and soft deletion. The `app.enforce_project_owner_membership` trigger rejects owners who are not active members of the organization and prevents ownership scope changes. `0003_projects.down.sql` removes only the project objects and policies.

## API contract

- `GET /api/projects` — list active projects visible in the organization.
- `POST /api/projects` — create a project for the verified caller.
- `GET /api/projects/:projectId` — load an active project.
- `PATCH /api/projects/:projectId` — update an owner/admin-accessible project.
- `DELETE /api/projects/:projectId` — soft-delete an owner/admin-accessible project.

Responses use safe intentional status codes: 401 authentication, 400 invalid input, 403 insufficient membership/role, 404 inaccessible project, 502 provider failure, and 500 unexpected server failure.

## Save identity semantics

A new local project starts with `projectId = "default-project"`. The first successful cloud save sends `POST /api/projects` and stores the server UUID in Zustand. Later saves send `PATCH /api/projects/:projectId`; the placeholder is never used in a PATCH.

## Fallback behavior

The UI distinguishes:

1. Cloud save succeeded.
2. Cloud unavailable but local IndexedDB safety save succeeded.
3. Cloud and local save both failed.

IndexedDB project failures are not swallowed. Cloud snapshots are validated before they enter application state, and serialization excludes `AudioBuffer`, browser runtime state, functions, MediaPipe state, and custom uploaded audio bytes.
