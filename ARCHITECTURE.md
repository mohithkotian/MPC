# MPC Architecture

This document separates what is verified in the checkout from the desired implementation. The audit baseline is branch `main`, commit `d5ca340`, with no pre-existing working-tree changes.

## A. Verified current architecture

### Startup and authentication
- `index.html` mounts the React application; `src/main.tsx` renders `<App />` inside `React.StrictMode`.
- `src/App.tsx` restores a Supabase session with `getSession()`, registers an auth-state listener, handles recovery mode, requires `email_confirmed_at`, and loads preset kit `kit1` for a confirmed session.
- `src/services/auth/supabaseAuth.ts` creates the browser Supabase client from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, with persisted sessions, auto-refresh, and URL detection.
- `src/components/auth/AuthScreen.tsx` is the unauthenticated/verification/recovery UI. The authenticated shell is `Chassis` with `MainView`, `SequencerView`, `MixerView`, `SamplingView`, and `KitBrowserModal` selected by `viewMode`.

### Frontend state and audio
- `src/store/useStore.ts` is the central Zustand store. It owns active bank, four banks of 16 pads, 16-step patterns, BPM, swing, transport flags, project metadata, undo/redo snapshots, kit loading state, and UI state.
- `PadConfig` in `src/types/index.ts` includes sample identifiers/URLs, runtime `audioBuffer`, volume, pitch, pan, mute/solo, choke group, synth parameters, and optional sample boundaries. Runtime buffers are removed by project serialization.
- `src/services/audio/AudioEngine.ts` lazily creates an `AudioContext`, master gain, analyser, buffer map, and active-voice/choke maps. It creates new source nodes per trigger, applies gain/velocity/pan/pitch, supports samples and synthesized voices, and tracks/stops active voices.
- `src/services/audio/SecureAudioLoader.ts` obtains the current Supabase session, resolves an active organization, requests `/api/audio/stream/:sampleId` with Bearer and organization headers, retries once after a 401 refresh, and returns an `ArrayBuffer`.
- `src/services/audio/AudioBufferCache.ts` is now the runtime-only cache primitive. It stores successful decoded values, shares one in-flight promise for a stable key, removes rejected loads so a later request can retry, and evicts oldest entries beyond its configured limit of 32.
- `AudioEngine.loadAudioFromUrl()` now canonicalizes protected sample references to `sample:<sampleId>` keys and routes fetch/decode through `AudioBufferCache`. `registerBuffer()` uses the same sample-key namespace, so locally decoded uploads can be reused by later sample-ID loads. Failed loads still return `null` to preserve the current UI contract; they do not poison the cache.
- `src/store/useStore.ts::triggerPad` resolves the selected bank/pad, applies mute/solo and velocity, then calls the audio engine immediately. Recording/overdub currently toggles the current 16-step cell when the transport is playing; it does not create a timestamped musical event.

### Current sequencer behavior
- The UI in `src/components/views/SequencerView.tsx` edits a fixed 16-step grid per pad and exposes swing, clear, and play/stop controls.
- `togglePlay()` starts a `window.setInterval` at `(60 / bpm / 4) * 1000`. Each interval calls `advanceStep()`.
- `advanceStep()` increments the current step, triggers active cells, and applies odd-step swing with `window.setTimeout`. `stopPlayback()` clears the interval and pending swing timeouts.
- This is a functional pattern sequencer approach, but it is not a Web Audio look-ahead scheduler. There is no general event ID, tick coordinate, tempo map, loop iteration, pause/resume position, duplicate-scheduling set, late-event policy, or scheduled-event cancellation model.

### Backend and protected sample delivery
- `server/index.ts` mounts `/api/auth`, `/api/me`, `/api/audio`, `/api/projects`, health, and readiness routes, with request IDs/logging, CORS from `ALLOWED_ORIGINS`, JSON size limits, and an error handler.
- `server/routes/auth.ts` requires a Bearer token, verifies it through Supabase, creates a request-scoped client, and idempotently upserts the caller profile. Organization membership is queried through `/api/me/organizations`.
- `server/routes/audio.ts` implements `/api/audio/manifest` and `/api/audio/stream/:sampleId`. Preset aliases are resolved from the local manifest in local mode; staging/production resolve organization catalog rows. UUID sample IDs require a ready, active, membership-scoped catalog row.
- `server/middleware/security.ts` applies no-cache headers, origin/referer checks, IP rate limiting, and an in-memory temporary blocklist. The audio route returns authorization/storage errors without exposing storage keys.
- `server/storage/SampleStorage.ts` validates safe UUID/organization keys. `LocalSampleStorage` reads opaque local MP3 filenames. `SupabaseStorage` uses the request-scoped Supabase Storage client and keeps the `samples` bucket private. The current Supabase implementation downloads the object into a `Buffer` before returning a readable stream; this is authenticated delivery, not progressive upstream streaming.
- The server cannot prevent an authorized browser from capturing decoded PCM. The security boundary is authorization and controlled delivery, not copy prevention.

### Project persistence and schema
- `server/routes/projects.ts` exposes authenticated list/create/get/update/delete routes.
- `server/services/projectService.ts` validates project fields, requires a UUID organization header, checks active organization membership and contributor/owner/admin roles, rejects unknown fields and runtime-only snapshot keys, and caps snapshots at 256 KiB.
- Migration `0003_projects.up.sql` creates organization-scoped `projects` with name, artist, BPM, swing, volume, bank, JSONB snapshot, timestamps, soft deletion, triggers, and RLS policies. It does not create separate sequence, track, event, or program tables.
- `src/services/projects/projectSerialization.ts` serializes banks and 16-step patterns while removing `audioBuffer`; `src/services/projects/projectApi.ts` sends authenticated organization-scoped requests to `/api/projects` and falls back through `src/services/db/storage.ts` when cloud save fails.
- Migration files are present in the repository. Live database application status was not independently verified in this session; do not infer it from file presence. Existing repository docs record prior staging work, but deployed evidence remains an external gate.

### Verified gaps and risks
- The desired `Recorder`, musical event store, tick conversion, look-ahead scheduler, loop model, and tempo-map behavior are not present as dedicated verified components.
- Kit loading is still sequential and there is no browser-level authorized playback verification in this session. The cache now deduplicates concurrent loads once callers request the same stable sample key.
- The current scheduler depends on JavaScript interval/timeout timing and therefore is vulnerable to UI/main-thread load and timer jitter.
- `ProjectData` still contains a `customSamples` ArrayBuffer type even though serializers reject/omit runtime data; this boundary should remain under review.
- Browser stress timing, deployed playback, live database state, migration application, and provider alert configuration were not verified in this session.

## B. Target architecture

Implement incrementally without replacing the verified auth, storage, Zustand, or AudioEngine foundations:

1. **Sample Manager / AudioBuffer Cache** — **implemented for the current loader path:** stable sample-ID keys, concurrent promise deduplication, decoded-buffer reuse, failed-load cleanup, and a 32-entry oldest-first bound. Explicit status-specific UI handling and browser memory tuning remain follow-up work.
2. **Program/Pad Resolver** — resolve bank/program/pad metadata to a sample reference and playback parameters without coupling React views to runtime audio nodes.
3. **Pad Input Router** — accept pad ID, velocity, and input time; route immediate playback and optionally pass the same interaction to recording.
4. **Immediate Audio Engine** — retain the current Web Audio voice/choke/effects behavior, add scheduled start-time support and sample start/end handling where justified.
5. **Recorder / Musical Event Store** — serializable stable event IDs, track/pad identity, tick position, velocity, and duration/note-off only if required. A pad hit must remain distinct from its recorded replay event.
6. **Tempo and tick conversion** — choose and document a PPQ (960 if no existing resolution is required), with deterministic BPM conversion and a tempo-map extension point.
7. **Quantization and swing** — pure tested functions; quantization separate from swing, with deterministic ordering and supported subdivisions.
8. **Look-ahead scheduler** — JavaScript timer only wakes the scheduler; the Web Audio clock receives exact future start times. Track scheduled event IDs by loop iteration, handle late events, stop/seek rebuilds, pause/resume, and loop boundaries.
9. **Project serialization/persistence** — extend the existing validated snapshot only after deciding whether nested data is sufficient or normalized tables are needed. Keep audio bytes out of relational project data.
10. **Diagnostics and export** — measure late scheduling, active voices, cache use, failed loads, processed events, and export behavior rather than claiming guarantees.

The corrected dependency direction is: scheduled events resolve directly through the Program/Pad Resolver and Audio Engine; they must not be routed back through the incoming Pad Input Router.
