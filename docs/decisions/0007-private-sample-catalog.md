# ADR 0007: Database-authoritative private sample catalog

- **Status:** Accepted
- **Date:** 2026-10-11
- **Scope:** Phase 5.5 only

## Decision

Staging and production resolve audio only from an authorized row in the Supabase `samples` table, then retrieve the row's trusted storage key from a private Supabase Storage bucket. Membership, lifecycle, content type, byte size, and storage-key validation happen before provider retrieval. The filesystem manifest is explicitly limited to local development/tests.

The server enforces a configurable maximum object size and content-type allowlist. The current Supabase SDK returns a `Blob`; the adapter checks provider metadata before consuming it and pipes the Blob's stream without creating a duplicate Buffer. This is the smallest compatible mitigation until a provider API with true metadata preflight/streaming is available.

## Alternatives considered

1. **Keep the manifest as a fallback in production** — rejected because it bypasses tenant catalog authority and can serve stale or unscoped keys.
2. **Add S3/R2 or migrate providers** — rejected as unnecessary for this phase; the existing Supabase Storage abstraction remains the production provider.
3. **Download to a Buffer and check size afterward** — rejected because it permits uncontrolled duplicate memory growth.
4. **Add a new database migration** — rejected because the existing `samples` schema already contains the required metadata and no schema change is required.

## Consequences

Operators must import licensed assets into the environment-specific private bucket and maintain matching `samples` metadata. Local development without seeded files can still exercise catalog behavior, but playback returns not-found until ignored local fixtures are supplied. Existing tracked sample bytes are removed from the working tree; Git history is not rewritten automatically. Repository owners should separately assess historical exposure and use an approved history-cleaning and credential/license review process if needed.
