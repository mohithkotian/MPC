# MPC Permissions and Tenant Context

## Authorization source of truth

Authentication identifies the Supabase user. Authorization is determined by the user’s active row in `organization_members` for the requested organization.

A client-selected organization ID is only a requested context. The server must verify:

```text
authenticated user ID + requested organization ID + active membership
```

The server then derives:

```text
organizationId
role
```

The backend must ignore `organization_id`, `user_id`, `role`, and permission fields in request bodies when deciding authorization.

> **Phase 1 limitation:** The current raw `pg` repository layer is not safe for authenticated production request authorization. A native PostgreSQL connection does not automatically establish the request JWT identity or `auth.uid()` context. Phase 2 must explicitly implement the authenticated database access strategy before these helpers are connected to authenticated production routes.

## Organization context flow

1. The client calls `GET /api/v1/me/organizations`.
2. The server returns organizations where the authenticated user has an active membership.
3. The client selects one organization for the current UI context.
4. Organization-scoped requests send `X-Organization-Id` or use an organization route parameter.
5. The server verifies membership on every organization-scoped request.
6. If membership is valid, the server attaches the verified organization and role to the request context.
7. If membership is removed, the request is rejected before tenant data or storage is accessed.

The selected organization may be stored in browser state or local storage for convenience. It is never trusted as authorization state.

## Roles

| Action | Owner | Admin | Member | Viewer |
|---|---:|---:|---:|---:|
| View organization | Yes | Yes | Yes | Yes |
| List samples | Yes | Yes | Yes | Yes |
| Stream authorized samples | Yes | Yes | Yes | Yes |
| Create/upload sample metadata | Yes | Yes | Yes | No |
| Update own sample metadata | Yes | Yes | Yes | No |
| Update any sample metadata | Yes | Yes | No | No |
| Delete sample | Yes | Yes | No | No |
| View active members | Yes | Yes | Yes | Yes |
| Invite member | Yes | Yes | No | No |
| Remove member | Yes | Yes | No | No |
| Change member role | Yes | Yes, except ownership | No | No |
| Transfer ownership | Yes | No | No | No |
| Delete organization | Yes | No | No | No |

Organization-management endpoints are out of scope for Phase 1. This matrix defines the intended policy for later phases.

## Invariants

- A user can belong to multiple organizations.
- A user can have a different role in each organization.
- There must always be at least one active owner.
- A removed member cannot access that organization’s resources, even if their Supabase access token remains valid.
- A member cannot change their own role unless a later policy explicitly permits it.
- Admins cannot promote themselves or another member to owner.
- Organization ownership changes require an explicit owner-only operation.
- A sample’s organization, uploader, and storage key are immutable after creation.

## Tenant query rules

Every tenant-owned query must include the verified organization context:

```sql
SELECT id, storage_key, original_name
FROM public.samples
WHERE id = $1
  AND organization_id = $2
  AND deleted_at IS NULL;
```

Never use:

```sql
SELECT * FROM public.samples WHERE id = $1;
```

Cross-organization access should normally return no row and later map to `404` so resource existence is not disclosed.

## Phase 1 boundary

Phase 1 creates the schema, RLS policies, test-only seed tooling, and repository helpers. It does not replace demo authentication, create organization-management APIs, connect R2 or Redis, or migrate audio files.
