# Implementation record 0014: Render cloud project API origin

## Status

Implemented locally on `fix/render-cloud-project-api-base`; pending PR review and staging validation. Cloud persistence is not claimed fixed until the deployed app successfully lists and saves a project.

## Cause

The cloud project request helper used `fetch(path)` for relative `/api/projects` URLs. On the Render Static Site this sent requests to the frontend origin, not the separate backend web service. Organization lookup already used `VITE_API_BASE`, so sign-in and organization retrieval could work while cloud project list/save failed and the UI fell back to local storage.

## Implementation

All project operations use one normalized `VITE_API_BASE` URL builder and preserve Bearer and `x-organization-id` headers. List, create, load, update, and delete share the same request path. HTTP errors with non-JSON bodies use a safe status-based message; successful malformed JSON and network errors produce typed `CloudProjectError`s rather than leaking parser/transport exceptions or silently reporting cloud success. Existing local fallback remains in the store and is not suppressed.

The Render staging Static Site should set build-time `VITE_API_BASE=https://mpc-staging-backend.onrender.com` and rebuild after the PR is merged to `main`. No Render configuration, data, or deployment was changed by this code task.

## Tests and verification

- Project client tests cover normalized backend URLs and same-origin local fallback, list/create/update/load/delete methods, Bearer and organization headers, non-JSON HTTP and success responses, and network failure handling.
- Existing project API and auth suites are run as separate gates.
- The app retains backend authorization and local fallback behavior.
- The auth suite passes (5/5), project client tests pass (7/7), lint passes, and `npm run build:server` passes. HTTP integration suites were attempted but local loopback connections fail with `EACCES` in this desktop execution environment.
- The Vite frontend build was attempted but esbuild cannot access a parent directory outside the allowed workspace (`Access is denied`).
- Dependency audit reports seven existing findings (five high, two moderate); no dependency changes were made.

## Remaining gates

1. Merge the reviewed PR and verify the Render frontend has the staging backend URL as its `VITE_API_BASE` build variable.
2. Verify in the deployed authenticated app that cloud projects list and that a new project saves to Supabase/PostgreSQL. Until then, persistence is not confirmed.
3. No database record was altered and no production deployment was performed.
