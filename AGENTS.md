# MPC Project Memory

## Read this first
Before changing code, read `AGENTS.md`, `ARCHITECTURE.md`, `PLAN.md`, and `PROGRESS.md`. Inspect the current Git branch and working tree, then verify the actual implementation. Update `PROGRESS.md` at every meaningful checkpoint and update `ARCHITECTURE.md` or `PLAN.md` when behavior or sequencing changes.

## Verified product and stack
MPC is a browser-based music production center. The verified stack is:

- Frontend: React 18, TypeScript, Vite 6, and Tailwind CSS.
- State: Zustand in `src/store/useStore.ts`.
- Audio: Web Audio API in `src/services/audio/AudioEngine.ts`; MediaPipe gesture input is present.
- Authentication: Supabase Auth with browser-managed sessions and verified Bearer access tokens.
- Backend: Node.js (repository engine range `>=22.0.0 <25.0.0`), Express 4, TypeScript, and `tsx`.
- Storage: `SampleStorage` abstraction with local filesystem storage for development/tests and request-scoped Supabase Storage for organization samples.
- Persistence: Express project routes backed by Supabase PostgreSQL migrations; browser projects also have local IndexedDB fallback code.
- Deployment direction: native Render Static Site frontend plus native Render Node Web Service backend; no Docker/nginx dependency is part of the verified repository architecture.

These are verified repository facts. A component name in a plan or diagram is not evidence that the component exists or is complete.

## Non-negotiable engineering rules
1. Inspect real files before modifying code.
2. Preserve unrelated user changes. Never use `git reset --hard`, `git clean -fd`, force-push, or other destructive Git operations.
3. Do not overwrite valid documentation blindly; preserve project-specific facts.
4. Classify claims as **verified implemented**, **partially implemented**, **broken**, **planned**, or **unknown**.
5. Never invent files, endpoints, schema fields, migrations, test results, deployment state, or performance/security guarantees.
6. Prefer the working modular-monolith architecture. Do not introduce another state manager, audio engine, auth system, database, or backend framework without a demonstrated need and reviewed decision.
7. Keep changes focused and avoid broad refactors or unnecessary dependencies.
8. Do not commit secrets, credentials, private URLs, proprietary samples, or build output.
9. Never put Supabase service-role keys, private storage credentials, signing secrets, or other server-only secrets in frontend code or `VITE_*` variables.
10. Authentication and authorization must remain server-enforced. Every auth/security change needs negative tests where the test infrastructure supports them.
11. Check sample authorization before storage retrieval. Validate storage keys; never accept an arbitrary client-supplied path.
12. Do not log tokens, cookies, passwords, raw authorization headers, private sample paths, or unnecessary personal data.
13. Do not persist `AudioBuffer`, `AudioContext`, source nodes, decoded audio, or other runtime-only objects in project JSON.
14. Do not use React renders, one timer per note, or `setTimeout` as the exact musical timing mechanism. JavaScript timers may wake a scheduler; the Web Audio clock must schedule playback.
15. Do not claim real-time accuracy, stress-test results, production readiness, security completeness, audio export, or migration application without evidence.
16. Do not stop at a plan when a safe implementation is possible; stop only for a genuine blocker or an explicit scope boundary.

## Authentication and private-audio invariants
- Supabase Auth is the identity authority. Use the official browser client for signup, login, verification, refresh, logout, password reset, and password update.
- Express verifies Bearer tokens with Supabase user verification and attaches a request-scoped Supabase client.
- No custom JWT, refresh cookie, demo username login, or fabricated identity is permitted.
- Audio requests must retain auth, origin/referer checks, rate limiting/blocklist behavior, organization/resource authorization, safe storage-key resolution, and no-cache headers.
- Browser-delivered audio can be captured after authorized decode. Describe this as authenticated/protected delivery, never as impossible to copy.
- Keep decoded buffers in runtime cache only; persisted projects contain sample references and editable metadata.

## Repository commands
From the repository root:

```text
npm ci
npm run lint
npm run build
npm run build:server
npm run test:auth
npm run test:api
npm run test:staging-smoke-auth
npm audit
```

`npm run lint` is currently `tsc --noEmit`. The package does not currently define a general unit-test script; use the focused scripts listed in `package.json`.

## Working loop
1. Inspect status, branch, relevant docs, package scripts, and implementation.
2. Write or update the smallest focused plan/checkpoint.
3. Add a focused regression test before fixing a security or behavior bug when practical.
4. Implement one coherent slice.
5. Run focused checks, then the full feasible verification set.
6. Inspect the diff for secrets, debug routes, hard-coded deployment URLs, and accidental sample files.
7. Update `ARCHITECTURE.md`, `PLAN.md`, and `PROGRESS.md` with verified outcomes.
8. List changed files, skipped/stubbed behavior, assumptions, and remaining risks.

## Current known baseline
Phase 1 now includes `src/services/audio/AudioBufferCache.ts`, a runtime-only bounded cache that deduplicates concurrent loads and removes failed loads for retry. `AudioEngine.loadAudioFromUrl()` uses stable sample keys and the cache; the focused cache tests and TypeScript checks pass. Browser authorized-playback verification is still not complete. The sequencer is not yet the target real-time event scheduler: `src/store/useStore.ts` advances a 16-step pattern using `window.setInterval` and swing `setTimeout` callbacks. There is no verified general musical event store, look-ahead scheduler, tempo map, or loop-iteration model. Do not describe those as complete.

See `docs/production-readiness-plan.md` and `docs/phase-5-7-readiness.md` for additional release gates. Do not call the application production-ready while those gates remain open.
