# MPC Progress Handoff

## Current state
- **Current phase:** Phase 1 complete for the implemented code/test slice; Phase 2 Pad Resolver/Input Router is next.
- **Branch:** `feat/sample-buffer-cache`, based on `main` commit `bf58e30`.
- **Scope of this checkpoint:** implemented runtime decoded-audio caching and updated the persistent context documents. No database, deployment, or external service configuration was changed.

## Phase 1 implementation completed
`src/services/audio/AudioBufferCache.ts` now provides a runtime-only generic cache with a 32-entry oldest-first bound. Successful values are stored, concurrent callers for the same key share one in-flight promise, and rejected loads are removed so later calls can retry.

`src/services/audio/AudioEngine.ts` now routes URL/sample loading through this cache. Protected sample references are canonicalized to `sample:<sampleId>` keys, API stream path references are normalized, and `registerBuffer()` uses the same namespace. Existing immediate playback, synth behavior, voice tracking, mute/solo, choke, and auth loader behavior were preserved.

`scripts/audio-buffer-cache.test.mjs` covers cache hits, concurrent deduplication, retry after rejection, and bounded eviction. `package.json` includes `test:audio-cache`.

## Verified current behavior
- React/Vite startup, Supabase session/auth flow, Zustand state, protected Express audio delivery, and organization-scoped project persistence remain present from the audit baseline.
- `AudioEngine` still creates fresh Web Audio source nodes for playback and keeps decoded buffers in runtime memory only.
- The current sequencer still uses a 16-step pattern with `window.setInterval` and swing `setTimeout`; the look-ahead musical event scheduler is not implemented.
- The new cache has been verified in isolation and is integrated into the AudioEngine load path. Browser authorized playback and rapid-pad network observation were not run.

## Commands run and outcomes
Dependency setup:
- `npm.cmd install --ignore-scripts --no-audit --no-fund` — **passed**, 279 packages installed. This was used after the earlier `npm ci` environment failure; no package dependency declarations changed.

Phase 1 and regression checks:
- `npm.cmd run test:audio-cache` — **passed**, 4 tests passed, 0 failed.
- `npm.cmd run lint` — **passed** (`tsc --noEmit`).
- `npm.cmd run build:server` — **passed**.
- `node --import tsx --test scripts/audio-engine.integration.test.mjs` — **passed**, 2 tests passed, 0 failed.
- `npm.cmd run test:auth` — **passed**, 5 tests passed, 0 failed.
- `npm.cmd run test:staging-smoke-auth` — **passed**, 12 tests passed, 0 failed.
- `npm.cmd run test:api` — **partially passed**, 33 of 47 tests passed. The 14 failures occurred before assertions because the test HTTP server could not bind local ports and returned `EACCES` for `::1`/`127.0.0.1`; the storage and pure project-validation cases in the same command passed.
- `npm.cmd run build` — **blocked by environment**, Vite/esbuild could not read/resolve the repository path and reported `Access is denied`; TypeScript completed before Vite failed.
- `npm.cmd exec -- node --import tsx --test scripts/audio-engine.integration.test.mjs` — **not a code result**; `npm exec` attempted to fetch a package named `node`. The direct `node --import tsx` retry above is the valid result.
- `git diff --check` — **passed**.

Not run successfully in this checkpoint: browser playback/stress verification, live staging playback, database tests, Semgrep, and `npm audit`. The previous audit recorded `npm audit --omit=dev` failing at the advisory endpoint. No timing measurements were invented.

## Files changed in this checkpoint
- `src/services/audio/AudioBufferCache.ts` — new bounded/deduplicating runtime cache.
- `src/services/audio/AudioEngine.ts` — stable cache-key integration and retry-safe load path.
- `scripts/audio-buffer-cache.test.mjs` — focused cache tests.
- `package.json` — `test:audio-cache` script.
- `AGENTS.md`, `ARCHITECTURE.md`, `PLAN.md`, `PROGRESS.md` — updated verified checkpoint and next-task context.

`package-lock.json` was restored to its pre-install content; no dependency version change is part of this slice.

## Known bugs, risks, and constraints
- Cache capacity is a documented 32-entry oldest-first policy, not a measured LRU or browser-memory budget.
- `AudioEngine.loadAudioFromUrl()` still returns `null` for all load/decode failures, while the UI receives only a coarse error state. More specific status handling can be addressed without bypassing auth.
- Current kit loading remains sequential.
- Supabase Storage retrieval still materializes the downloaded object into a server Buffer before returning a readable body; this is protected delivery, not progressive streaming.
- Browser-delivered decoded audio can be captured by an authorized user.
- The local environment still blocks Vite path resolution and local test-server port binding. These are not evidence of a Phase 1 code regression.

## Exact next task: Phase 2
Implement the smallest Pad Resolver/Input Router slice around the current immediate playback path.

Inspect first:
- `src/store/useStore.ts` (`triggerPad` and `loadPresetKit`)
- `src/types/index.ts` (`PadConfig`)
- `src/services/audio/AudioEngine.ts`
- `src/services/audio/padRouting.ts`
- `src/components/pads/Pad.tsx`
- `src/components/pads/PadGrid.tsx`
- `src/components/controls/PadBanks.tsx`
- `scripts/audio-engine.integration.test.mjs`

Required constraints:
- Preserve the existing visual UI, Zustand conventions, secure loader, and cache.
- Separate incoming pad interaction from program/pad/sample resolution and immediate audio triggering.
- Do not create a musical event store yet; that is Phase 3.
- Define behavior for missing buffers, synth pads, mute/solo, suspended AudioContext, velocity, and rapid retriggers.
- Add focused tests before broad refactoring.

Acceptance criteria:
1. Pad interaction enters one dedicated router/resolver path.
2. The resolver returns the current pad’s sample/synth/playback metadata without exposing runtime persistence objects.
3. Immediate playback continues to use fresh Web Audio source nodes and the decoded cache.
4. Existing mute/solo/choke/velocity behavior remains covered by tests.
5. Typecheck, focused audio tests, auth tests, and relevant API/storage tests are rerun; environment failures are recorded precisely.

## Ready-to-copy continuation prompt
> Read `AGENTS.md`, `ARCHITECTURE.md`, `PLAN.md`, and `PROGRESS.md` first. Inspect the current Git status and continue on `feat/sample-buffer-cache` from the completed Phase 1 checkpoint. Implement Phase 2 only: extract a focused Program/Pad Resolver and Pad Input Router around the existing immediate AudioEngine path, preserving secure loading, the 32-entry decoded cache, Zustand, and the current UI. Add focused tests, do not add musical events yet, run feasible checks, inspect the diff, and update all four context files with verified results.
