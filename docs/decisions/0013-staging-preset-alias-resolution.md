# Implementation record 0013: Staging preset alias resolution

## Status

Implemented locally on `fix/staging-preset-audio-404`; not deployed. Playback remains unverified and will remain unavailable until approved, redistribution-cleared samples are cataloged and stored.

## Evidence

- The signed-in staging application reproduced repeated 404 responses for preset stream requests. Render backend logs showed `/api/audio/stream/:sampleId` returning 404 during the reproduction; an example request ID was `7f2a073a-5688-4733-a45c-0aa195532fb9`.
- The staging database's `samples` table contains one active ready row, but it has `kit_id = NULL` and `pad_index = NULL`. Its matching private Storage object exists. No catalog rows are present for `kit1`/`kit2` preset pads.
- This establishes a missing preset catalog mapping as the observed staging cause. It does not establish that the existing unaliased object is licensed for preset use.
- Direct unauthenticated navigation to `https://mpc-staging-backend.onrender.com/api/audio/stream/kit1-pad11` returned 403 `Forbidden: Unauthorized Referer`; the signed-in application, not that direct navigation, supplied the authenticated 404 reproduction.

## Implementation

In staging/production, a preset alias such as `kit1-pad11` is resolved by the request-scoped Supabase client: active organization memberships are loaded for the authenticated user, then the ready, non-deleted `samples` row is selected by kit and zero-based pad index within those organizations. An optional `x-organization-id` narrows that set and must be a UUID. Ambiguous, missing, malformed, inaccessible, or unsafe-key results fail closed as a non-enumerating not-found response. The trusted storage key is used only after membership and catalog checks.

The manifest route and alias resolver use filesystem manifest data only in local/test environments. No service-role key, public bucket, sample binary, schema migration, or storage mutation is introduced.

## Regression coverage

Added tests for a unique authorized catalog result, missing catalog row, cross-organization exclusion, missing private object, and a non-enumerating 404 response. Existing local manifest-backed successful stream test remains in place.

## Validation

- `npm ci`: completed; 280 packages installed.
- `npm run lint`: passed (`tsc --noEmit`).
- `npm run build:server`: passed.
- Focused storage suite: 14/14 passed.
- Full API test command could not complete because the desktop execution policy denied loopback socket connections (`EACCES`).
- Frontend `npm run build` reached Vite but esbuild could not access the parent directory (`Access is denied`); frontend TypeScript lint passed.
- `npm audit --audit-level=high` reports seven existing dependency findings (five high, two moderate); see ADR 0010. No dependency changes were made.
- Semgrep workflow was not run locally.

## Remaining gates and risks

1. Obtain and document redistribution rights for replacement/approved `FATHER` and `RUNAWAY` audio, then import assets into the private staging bucket with matching organization-scoped catalog rows. Do not reuse the current unaliased object without provenance approval.
2. After a trusted branch/CI workflow is approved and changes are deployed to staging, verify a real authorized stream returns 200 and plays; verify missing, cross-organization, and unauthorized resources remain non-enumerating 404s. No playback-fix claim is made here.
3. Supabase's read-only table inspection reported `public.schema_migrations` with RLS disabled. The suggested SQL is `ALTER TABLE "public"."schema_migrations" ENABLE ROW LEVEL SECURITY;`, but applying RLS without an owner-selected policy can block needed access. This was not changed; the owner must choose the intended access policy.
4. Do not deploy to production; this task made no deployment or staging data change.
