# Sample storage architecture

MPC authenticates the caller first, authorizes organization/sample access second, and retrieves audio through `SampleStorage` only after authorization succeeds.

```text
Bearer token → Express authentication → RLS/member authorization
             → trusted storage_key validation → SampleStorage retrieval
```

## Providers

- `STORAGE_PROVIDER=local` uses `LocalSampleStorage` and `server/storage/samples`. This is for local development and tests only.
- `STORAGE_PROVIDER=supabase` uses `SupabaseStorage` with the request-scoped Supabase client and a private bucket named by `SUPABASE_STORAGE_BUCKET`.
- `NODE_ENV=staging` and `NODE_ENV=production` default to Supabase Storage and reject local storage. They also fail at startup if `SUPABASE_STORAGE_BUCKET` is missing.

The browser receives only the public Supabase URL and publishable/anon key. No service-role key is used or exposed by this implementation.

## Object-key rules

Tenant sample keys are trusted only after the sample row is selected through the caller-token Supabase client and an active membership is confirmed. The server rejects traversal, absolute paths, arbitrary filenames, and malformed UUID MP3 keys before storage retrieval.

A recommended private bucket layout is:

```text
organizations/{organizationId}/samples/{sampleId}.mp3
```

The Supabase bucket must remain private, with Storage policies configured separately for the staging project. Do not make it public and do not place credentials in `VITE_*` variables.

## Local development

Use `STORAGE_PROVIDER=local` with the existing checked-in development samples. Local playback remains available; production/staging cannot silently fall back to the local filesystem.

## Deferred work

Uploads, deletion, object metadata persistence, Storage RLS policies, and migration of existing sample bytes are intentionally deferred to a separately reviewed staging-storage operation. No database migration was added in Phase 3B.
