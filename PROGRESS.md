# MPC Progress Handoff

## Current state
- **Current phase:** Phase 0 audit/context complete; Phase 1 sample-cache work is the next implementation phase.
- **Git:** `main` at `d5ca340` (`Merge pull request #18 from mohithkotian/feat/pulse-mpc-audio-completion-final`). Checkout was clean before these four documentation files were added.
- **Scope of this session:** documentation and repository audit only. No application code, schema, deployment, or external database was changed.

## What is verified to work in the repository
- React/Vite app startup through `src/main.tsx` and `src/App.tsx`.
- Supabase browser session restore/listener, email-confirmed gate, recovery path, and preset-kit load path are implemented in code.
- Zustand owns the current UI/audio/project state in `src/store/useStore.ts`.
- `AudioEngine` creates Web Audio sources for samples/synths, applies volume/velocity/pan/pitch/choke behavior, tracks voices, and has a URL-keyed decoded-buffer map.
- `SecureAudioLoader` sends an authenticated organization-scoped request to `/api/audio/stream/:sampleId` and has one 401 refresh retry.
- Express audio delivery authenticates Bearer tokens, validates origin/referer/rate limits, authorizes preset or tenant sample access, validates storage keys, and reads from local or Supabase-backed `SampleStorage`.
- Authenticated organization-scoped project list/create/get/update/delete routes and project snapshot validation are implemented.
- Local IndexedDB project/sample fallback code exists.
- The current sequencer edits 16-step bank patterns and plays them through `setInterval` plus swing `setTimeout`; this is **not** the target look-ahead event scheduler.

## What is incomplete, broken, or unknown
- No dedicated `AudioBufferCache` with concurrent-request dedupe/eviction policy is verified.
- No dedicated Program/Pad Resolver, Pad Input Router, Recorder, general musical Event Store, tick/tempo-map model, look-ahead scheduler, loop-iteration tracking, or duplicate scheduling prevention is verified.
- Current scheduling uses `window.setInterval` and swing `window.setTimeout`, so timing accuracy under UI load is not established.
- Project persistence stores banks and fixed patterns in one JSON snapshot; separate sequences/tracks/events/program tables do not exist in the inspected migrations.
- Supabase storage retrieval materializes the downloaded object into a Buffer before returning a readable body; this is protected delivery, not progressive streaming.
- Live database migration application, deployed staging playback, browser stress timing, provider alerts, restore drill, rollback rehearsal, and licensing/exposure gates were not verified.
- Production readiness must not be claimed; see `docs/production-readiness-plan.md` and `docs/phase-5-7-readiness.md`.

## Files changed this session
- `AGENTS.md` — preserved the repository rules and added verified baseline, security invariants, and handoff workflow.
- `ARCHITECTURE.md` — documented verified current architecture separately from target architecture.
- `PLAN.md` — created phased roadmap with dependencies, status, acceptance criteria, and risks.
- `PROGRESS.md` — this handoff.

## Commands actually run
Initial checkout audit:
- `git clone https://github.com/mohithkotian/MPC.git .` — passed.
- `git status` without a safe-directory override — blocked by Git dubious-ownership protection. The repository was otherwise inspected; later `git -c safe.directory="$PWD" status` succeeded.
- `git -c safe.directory="$PWD" status --short --branch` — clean `main` before documentation edits.
- `git -c safe.directory="$PWD" log -1 --oneline --decorate` — `d5ca340` merge commit.

Verification attempt 1:
- `npm ci`, lint, builds, tests, and audit via PowerShell `npm` — could not invoke `npm.ps1` because the system execution policy disables PowerShell scripts. This is an environment failure, not a code result.

Verification attempt 2 via `npm.cmd`:
- `npm.cmd ci` — **failed** with npm error `Exit handler never called!`; dependencies were not installed.
- `npm.cmd run lint` — **failed** because `tsc` was not found (consequence of missing dependencies).
- `npm.cmd run build` — **failed** because `tsc` was not found.
- `npm.cmd run build:server` — **failed** because `tsc` was not found.
- `npm.cmd run test:auth` — **failed** because `node_modules/tsx` was missing.
- `npm.cmd run test:api` — **failed** because `node_modules/tsx` was missing.
- `npm.cmd run test:staging-smoke-auth` — **passed**, 12 tests passed, 0 failed; this script uses Node built-ins and did not require the missing dependency tree.
- `npm.cmd audit --omit=dev` — **failed** because the npm audit advisory endpoint returned an error.

Not run successfully: frontend build, backend build, lint/typecheck, API/auth TypeScript tests, browser stress tests, deployed checks, database tests, or Semgrep in this session. No timing measurements were invented.

## Security and data decisions recorded
- Keep Supabase service-role/private storage credentials server-only.
- Preserve Bearer verification, organization membership checks, safe storage-key validation, private bucket behavior, origin/referer checks, rate limiting, and no-cache audio responses.
- Do not claim decoded browser audio cannot be captured.
- Keep runtime audio buffers/nodes out of project JSON.
- Treat migration files as source artifacts only; do not say they are applied without live evidence.

## Exact next task
Implement **Phase 1: a stable decoded sample cache with concurrent request deduplication**, then connect the existing pad path to it without changing authentication or the visual UI.

### Inspect these files first
- `src/services/audio/AudioEngine.ts`
- `src/services/audio/SecureAudioLoader.ts`
- `src/store/useStore.ts` (`triggerPad`, `loadPresetKit`, `loadProjectFromStorage`)
- `src/services/audio/presetKits.ts`
- `server/routes/audio.ts`
- `server/storage/SampleStorage.ts`
- existing audio tests under `scripts/audio-engine.integration.test.mjs` and `server/tests/storage.test.ts`

### Constraints
- Reuse the protected endpoint and current AudioEngine behavior.
- Cache by stable sample identity, deduplicate concurrent loads, remove failed entries, and do not put buffers/nodes into persistence.
- Do not claim the result is progressive streaming or copy-proof.
- Add focused tests before broad refactoring; preserve unrelated changes.

### Acceptance criteria for the next checkpoint
- Two simultaneous requests for one sample share one fetch/decode operation.
- A subsequent pad hit reuses the decoded buffer without a backend request.
- Failed loads do not poison future retries.
- Missing/unauthorized/rate-limited responses remain distinguishable enough for current UI behavior.
- Existing auth and storage tests remain green when dependencies are installable.
- Update `ARCHITECTURE.md`, `PLAN.md`, and this file with actual results.

### Tests to run next
After resolving the local npm installation problem, run:

```text
npm.cmd ci
npm.cmd run lint
npm.cmd run build
npm.cmd run build:server
npm.cmd run test:auth
npm.cmd run test:api
npm.cmd run test:staging-smoke-auth
npm.cmd audit --omit=dev
```

Also run focused cache/audio tests and, if available, a browser interaction test for authorized sample load and rapid repeated pad playback. Record failures as environment, code, or external-service failures.

## Ready-to-copy continuation prompt
> Read `AGENTS.md`, `ARCHITECTURE.md`, `PLAN.md`, and `PROGRESS.md` first. Inspect the current Git status and actual implementation. Continue from the exact Phase 1 checkpoint in `PROGRESS.md`: implement the stable decoded sample cache with concurrent request deduplication using the existing `SecureAudioLoader` and `AudioEngine`. Do not repeat completed audit work, trust undocumented assumptions, or rebuild working auth/storage/UI systems. Add focused tests, run the feasible verification commands, inspect the diff, and update all four context files with verified results.
