# ADR 0004: Cloud project library scope

## Status

Accepted for `feature/cloud-project-library`.

## Decision

MPC projects are stored in `public.projects` with both `organization_id` and `owner_id`. The selected organization is a request context, never an authority; the server verifies active membership using the authenticated Supabase caller-token client. Projects are private to their owner in the first cloud-library slice. Cross-user and cross-organization access returns a non-enumerating 404.

The project snapshot stores serializable MPC state in JSONB. Runtime `AudioBuffer` values and browser-local `customSamples` bytes are excluded. IndexedDB remains the offline fallback until the sample-library phase provides durable cloud sample metadata and storage synchronization.

## Consequences

- The cloud library is safe to introduce without adding collaboration semantics prematurely.
- A user can reopen scalar/pattern/project state across browsers, but locally uploaded audio is not portable yet.
- The API must require `x-organization-id` and a verified Bearer token on every project operation.
- A later collaboration phase can add explicit sharing or organization-wide visibility without weakening the initial privacy boundary.
