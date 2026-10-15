# MPC Implementation Plan

Status is based on the verified checkout at `main` / `d5ca340`. This roadmap extends the existing secure-audio and 16-step pattern implementation; it is not a rewrite plan.

## Phase 0 — Audit and persistent context
**Status: Complete for this session**

**Dependencies:** repository checkout and read access.

**Completed evidence:** inspected the existing instructions, package scripts, React startup/auth, Zustand store, audio engine/loader, audio and project routes, storage validation, migrations, serializer, and sequencer UI. Created/updated `AGENTS.md`, `ARCHITECTURE.md`, `PLAN.md`, and `PROGRESS.md`.

**Acceptance criteria:** current and target architecture are separated; no planned component is described as implemented; tests and environment failures are recorded with exact outcomes.

## Phase 1 — Reliable sample loading and cache
**Status: Pending**

**Dependencies:** existing `SecureAudioLoader`, `AudioEngine`, protected audio route, and preset/catalog behavior.

**Tasks:**
- Introduce or extract a stable sample-ID keyed cache around decoded buffers.
- Deduplicate concurrent requests for the same sample and remove rejected promises so retries work.
- Preserve Bearer/org authorization and distinguish permanent authorization failures from retryable failures.
- Define a modest memory strategy appropriate to the app; never persist buffers or nodes.
- Verify rapid repeated pad triggers reuse a decoded buffer and do not request the backend per hit.

**Acceptance criteria:** focused unit tests cover cache hits, concurrent dedupe, failed-load retry, and missing sample behavior; an authorized sample can be loaded and reused by multiple pads in a browser-capable environment; unauthorized access remains rejected.

**Risks/decisions:** browser memory limits and whether cache eviction should be LRU or explicit kit lifecycle. Do not call this progressive streaming: Supabase storage currently downloads before the server returns its readable body.

## Phase 2 — Pad resolver, input routing, and immediate playback
**Status: Partially implemented**

The current store-to-`AudioEngine.triggerPad` path works as the immediate path, including mute/solo, velocity, pitch, pan, choke, and synth fallback. A dedicated resolver/router is not yet present.

**Dependencies:** Phase 1 cache; current pad model and AudioEngine.

**Tasks:** isolate pad/program resolution and input routing; add scheduled start-time support to the engine without coupling React renders to audio nodes; define missing-buffer, suspended-context, rapid-retrigger, and voice-limit behavior; honor sample start/end if supported by the chosen model.

**Acceptance criteria:** pad interaction produces immediate local playback from a decoded buffer; repeated playback creates fresh source nodes; routing tests cover mute/solo and missing samples; no new request is made for every hit.

## Phase 3 — Recording and musical event model
**Status: Pending**

**Dependencies:** Phase 2 input router and a documented PPQ.

**Tasks:** create deterministic serializable events with stable ID, track ID, pad identity, tick, velocity, and optional duration; capture AudioContext time on input; convert time to musical coordinates; keep immediate pad playback separate from event recording; apply quantization only when enabled.

**Acceptance criteria:** recording a pad creates an event with deterministic ordering and no runtime audio objects; event add/remove/replay data survives serialization; unit tests cover time/tick conversion and event ordering.

**Risk:** avoid prematurely adding MIDI, aftertouch, pressure, or note-expression fields not required by the current instrument mode.

## Phase 4 — Web Audio look-ahead scheduler and transport
**Status: Pending**

**Dependencies:** Phase 2 scheduled engine and Phase 3 event store/timing model.

**Tasks:** implement play/stop/pause/resume, constant-BPM conversion, configurable look-ahead interval/horizon, scheduled-event tracking, duplicate prevention, late-event policy, cancellation/rebuild on stop/seek, and UI playhead updates outside the timing-critical path.

**Acceptance criteria:** scheduler queries upcoming events and schedules sources on `AudioContext.currentTime`; repeated scheduler wakeups do not duplicate an event; tests cover tick-to-time, ordering, late events, stop/rebuild, and transport transitions. Browser measurements must be recorded if performed; do not claim hard real-time guarantees.

## Phase 5 — Quantization, swing, looping, and tempo changes
**Status: Pending**

**Dependencies:** Phase 4 event/scheduler model.

**Tasks:** implement pure quantization for justified grids, keep swing separate, define loop start/end convention and loop iteration identity, handle events crossing boundaries, and add tempo-map conversion only if product behavior requires it.

**Acceptance criteria:** tests cover exact/on-between-grid values, adjacent events, swing ordering, loop boundaries, duplicate prevention across iterations, and tempo changes. Pause/resume playhead semantics are documented.

## Phase 6 — Editable project persistence
**Status: Partially implemented**

Current cloud/local persistence stores metadata, banks, and fixed patterns in a validated JSON snapshot. It does not store a general event/track/tempo-map model or separate sequence tables.

**Dependencies:** stable event schema from Phases 3–5 and existing project ownership/RLS.

**Tasks:** decide nested snapshot versus normalized sequence tables; extend validation and serializers; preserve organization and owner/admin checks; add migration only if required; keep samples as references/metadata and audio bytes in private storage.

**Acceptance criteria:** save/load round trips all editable musical state; runtime-only fields are rejected; unauthorized organization/project access is denied; migrations are actually applied in an environment before being reported as applied.

## Phase 7 — Diagnostics, testing, and export hardening
**Status: Pending**

**Dependencies:** completed vertical slice.

**Tasks:** add counters for late scheduling, active voices, cache use, failed sample loads, and processed events; run focused and full checks; test stress behavior in a browser where available; inspect export path (`src/services/audio/wavExport.ts`) against the event model.

**Acceptance criteria:** typecheck, frontend/backend build, relevant unit/API/security tests, dependency audit, and security checks have recorded outcomes. Browser-only stress/deployed checks are explicitly marked run or not run. Production readiness remains blocked until repository release gates and external staging evidence are closed.

## Recommended next slice
Start Phase 1, then Phase 2, as the smallest useful vertical slice: authenticated sample load → decoded cache reuse → pad resolver → immediate playback. Do not begin database normalization or export work before the event model is stable.
