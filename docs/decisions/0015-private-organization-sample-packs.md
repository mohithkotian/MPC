# Implementation record 0015: private organization sample packs

## Status

Approved by the user for staging only. Migration 0004 and its MPC migration-ledger entry are applied in staging; 26 ready catalog rows were inserted from the preflighted uploaded objects. The backend key validation is implemented on a focused feature branch, not yet deployed. Production remains untouched, and playback is not claimed fixed.

## Confirmed cause and inventory

The staging private `samples` bucket contained all 26 uploaded MP3 objects under the organization’s `samples/father/` and `samples/runaway/` prefixes. All objects reported `audio/mpeg` and a positive size. The catalog had no rows for those named objects, so aliases could not resolve to them. A separate earlier UUID-named object is unrelated and remains unchanged. Storage owner metadata is null for the uploaded objects; the target organization’s creator is confirmed to be the current active organization owner and is therefore the verified catalog attribution used for the import.

The mapping is taken from the existing preparation script, not inferred from audio contents:

- FATHER (`kit1`): pad indices 0–12 map to `vocal1`, `vocal2`, `vocal3`, `vocal4`, `faaaather`, `bad-to-us`, `see-this-coat`, `lord-fast`, `beat-loop-2`, `intro`, `guitar`, `lord-long`, `turn-me-up`.
- RUNAWAY (`kit2`): pad indices 0–12 map to `piano1`–`piano8`, `LookAtCha`, `LadiesNGentlemen`, `Hey`, `BeautifulStars`, `Instrumental-loop`.

The UI aliases are one-based (`kit1-pad11`, `kit2-pad1`); database `pad_index` values are zero-based (10 and 0 respectively).

## Security and storage decisions

- Keep the `samples` bucket private. The applied `storage.objects` policy grants `SELECT` only to authenticated callers who are active members of the organization encoded in the object path. It is restricted to the `samples` bucket and exact FATHER/RUNAWAY MP3 path shape; it grants no write access. Staging verification confirmed the bucket is still private and this is the only policy on `storage.objects`.
- In staging/production, resolve aliases only through the authenticated database catalog, require active membership in the exact `x-organization-id`, require one unique ready row, and validate both organization UUID and kit-folder against the row/alias before constructing the storage adapter.
- Retrieve bytes only through the row’s validated `storage_key`; preserve the non-enumerating 404 response and authorization-before-object-retrieval ordering.
- Insert only 26 missing catalog rows after preflight; use the user-confirmed mapping, existing object sizes/content types, the active organization ID, and verified owner profile attribution. Do not change the unrelated uploaded object, overwrite rows, publish objects, add sample files to Git, or alter production.

## Verification and remaining gates

- The focused storage/authorization suite passes (23/23), including FATHER/RUNAWAY aliases, zero-based pad indices, missing catalog/object behavior, cross-organization denial for both catalog rows and embedded object paths, storage not created before authorization, and a migration scope guard.
- Authentication tests pass (5/5); lint and backend build pass. The frontend production build succeeded using a temporary workspace-local config with the same build-relevant plugin and alias.
- The broader API suite’s HTTP tests are blocked by this Windows desktop’s inability to bind/connect to local test servers (`EACCES` on loopback); unit/client tests pass. The normal Vite config loader is blocked while scanning a parent directory outside the workspace. The temporary Vite build emitted a large-chunk warning. `npm audit` reports 7 existing advisories (5 high, 2 moderate); no dependency changes were made. Semgrep runs in GitHub Actions and must be confirmed on the PR.
- Remaining: merge/deploy the code to staging through the protected review process; confirm the browser’s `VITE_API_BASE` and auth build variables; then make an authenticated audio request returning HTTP 200 and confirm real FATHER/RUNAWAY audio plays. Until those are observed, playback is not claimed fixed.
