# Cloud Project Library Implementation Plan

> **For agentic workers:** Implement task-by-task with test-first development and verify each task before moving on.

**Goal:** Add tenant-scoped cloud project CRUD and connect the existing Kits & Projects UI with a safe IndexedDB fallback.

**Architecture:** Supabase Auth remains the identity authority. Express project routes use the verified caller-token Supabase client and a project service that validates input, scopes by active membership and `auth.uid()`, and maps database results to the API contract. The browser sends only serializable project state; IndexedDB remains the offline fallback.

**Tech Stack:** React 18, TypeScript, Express 4, Supabase REST/RLS, PostgreSQL migrations, Node test runner.

**Spec:** `docs/superpowers/specs/2026-10-10-cloud-project-library-design.md`

## Global Constraints

- Never trust client-supplied user, owner, role, or organization identity.
- Require Bearer authentication and active organization membership on every project endpoint.
- Return non-enumerating `404` for malformed, missing, deleted, or unauthorized project resources.
- Never send `AudioBuffer`, custom sample bytes, tokens, or raw database errors to the API.
- Use a migration for every persistent schema change.
- Keep route handlers thin and use caller-token Supabase access for request authorization.
- Preserve IndexedDB fallback behavior and do not change sample upload semantics in this slice.

## Review Focus

- Cross-user project IDs return `404`, not project data — API negative test.
- A forged `x-organization-id` cannot bypass membership — API negative test.
- Runtime `AudioBuffer` and `customSamples` do not enter JSON — serialization unit test.
- Cloud outage does not destroy a locally savable project — fallback service/UI test.
- Deleted projects stay non-enumerating — API delete/reload test.

---

### Task 1: Add the projects schema and reversible migration

**Files:**
- Create: `server/db/migrations/0003_projects.up.sql`
- Create: `server/db/migrations/0003_projects.down.sql`
- Test: extend `server/db/tests/runDatabaseTests.ts` with schema, constraint, RLS, and rollback assertions.

**Interfaces:**
- Produces `public.projects` with UUID IDs, organization/owner scope, serializable project state, indexes, grants, RLS policies, and `updated_at` trigger.

- [ ] Write failing database assertions for table shape, active-row index, owner-scoped policies, invalid scalar values, and rollback.
- [ ] Run the database test command and confirm the new assertions fail because the table is absent.
- [ ] Implement the up/down migrations using the exact columns and policies from the spec.
- [ ] Run migration tests and confirm the assertions pass.
- [ ] Commit: `feat: add tenant-scoped projects schema`.

### Task 2: Add project validation and service boundaries

**Files:**
- Create: `server/services/projectService.ts`
- Test: `server/tests/projectService.test.ts`

**Interfaces:**
- `serializeProjectInput(input: unknown): ProjectInput`
- `projectResponse(row: ProjectRow): ProjectResponse`
- `listProjects(client, userId, organizationId): Promise<ProjectResponse[]>`
- `createProject(client, userId, organizationId, input): Promise<ProjectResponse>`
- `findProject(client, userId, organizationId, projectId): Promise<ProjectResponse | null>`
- `updateProject(client, userId, organizationId, projectId, input): Promise<ProjectResponse | null>`
- `deleteProject(client, userId, organizationId, projectId): Promise<boolean>`

- [ ] Write failing tests for scalar bounds, active-bank validation, required banks/patterns, runtime-field stripping, and UUID validation.
- [ ] Run the focused test and confirm RED.
- [ ] Implement strict validation without adding a new dependency; reject unknown top-level fields and oversized JSON.
- [ ] Implement Supabase queries with organization, owner, and `deleted_at` predicates on every operation.
- [ ] Run the focused tests and confirm GREEN.
- [ ] Commit: `feat: add project validation and service`.

### Task 3: Add protected project routes

**Files:**
- Create: `server/routes/projects.ts`
- Modify: `server/index.ts`
- Test: `server/tests/api.test.ts` or create `server/tests/projects.test.ts`.

**Interfaces:**
- `createProjectRouter(): Router`
- Routes: `GET /api/projects`, `POST /api/projects`, `GET/PATCH/DELETE /api/projects/:projectId`.

- [ ] Add failing API tests for missing auth, invalid organization header, owner CRUD, malformed IDs, cross-user `404`, and deleted project `404`.
- [ ] Run the focused API test and confirm RED.
- [ ] Implement `requireAuth` plus strict `x-organization-id` UUID validation and service calls.
- [ ] Register `/api/projects` after `/api/me` and before audio routes.
- [ ] Run auth, API, and project tests and confirm GREEN.
- [ ] Commit: `feat: expose authenticated project api`.

### Task 4: Add browser project API and serialization

**Files:**
- Create: `src/services/projects/projectApi.ts`
- Create: `src/services/projects/projectSerialization.ts`
- Test: `src/services/projects/projectSerialization.test.ts`.

**Interfaces:**
- `toCloudProjectInput(project: ProjectData): CloudProjectInput`
- `fromCloudProject(response: CloudProjectResponse): ProjectData`
- `listCloudProjects(organizationId: string): Promise<ProjectData[]>`
- `createCloudProject(organizationId: string, project: ProjectData): Promise<ProjectData>`
- `updateCloudProject(organizationId: string, project: ProjectData): Promise<ProjectData>`
- `deleteCloudProject(organizationId: string, projectId: string): Promise<void>`

- [ ] Write failing serialization tests proving `audioBuffer` and `customSamples` are omitted while banks/patterns remain.
- [ ] Run the focused test and confirm RED.
- [ ] Implement API calls using `getSession()` and `VITE_API_BASE`, with clear errors and no token logging.
- [ ] Run focused frontend typecheck/tests and confirm GREEN.
- [ ] Commit: `feat: add browser project api client`.

### Task 5: Connect Kits & Projects to cloud-first persistence

**Files:**
- Modify: `src/components/views/KitBrowserModal.tsx`
- Modify: `src/store/useStore.ts`
- Modify: `src/types/index.ts` only if response mapping requires a type addition.
- Test: focused component/service tests if the existing test setup supports them.

**Interfaces:**
- `getActiveOrganizationId(): Promise<string | null>` using `/api/me/organizations` and the first organization for this slice.
- Save a local safety snapshot, then synchronize to the cloud; retain the local snapshot on cloud failure.
- Load cloud-first; fallback to `loadProjectsFromDB` on cloud failure.

- [ ] Add a failing test for cloud failure preserving the IndexedDB save path.
- [ ] Implement the smallest UI/store integration, retaining preset loading and current status messaging.
- [ ] Show `LOCAL ONLY` when fallback is used and avoid claiming cloud persistence.
- [ ] Run frontend build and focused tests.
- [ ] Commit: `feat: connect kits browser to cloud projects`.

### Task 6: Full verification and review

**Files:**
- Modify: `docs/decisions/0004-cloud-project-library.md` if implementation decisions materially differ.
- Modify: `docs/production-readiness-plan.md` to mark project persistence status accurately.

- [ ] Run `npm ci`.
- [ ] Run `npm run lint` and `npm run typecheck:server`.
- [ ] Run `npm run test:auth`, `npm run test:api`, and `npm run db:test` where environment permits.
- [ ] Run `npm run build` and `npm run build:server`.
- [ ] Run `npm audit` and inspect the Semgrep workflow configuration.
- [ ] Review the diff for secrets, private URLs, debug routes, generated output, and tracked media.
- [ ] Request an independent code review and fix Critical/Important findings.
- [ ] Report changed files, skipped behavior, assumptions, and remaining risks.
