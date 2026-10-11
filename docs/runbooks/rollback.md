# MPC Application Rollback Runbook

**Owner:** MPC maintainers
**Reviewed:** 2026-10-11
**Current evidence:** **NOT REHEARSED**. This document is a procedure, not proof of a staging rollback.

## Before rollback

1. Declare the incident and record the new release SHA, last known-good SHA, deployment time, symptoms, and request IDs.
2. Confirm the known-good frontend and backend SHAs are available in Render/GitHub.
3. Check migration compatibility. If the new release applied a non-backward-compatible schema change, stop and obtain the migration owner’s forward-fix plan. Do not run a destructive down migration as an emergency shortcut.
4. Obtain the required staging or production deployment approval. Production deployment and rollback are outside this local implementation task.

## Staging rehearsal procedure

1. Deploy the known-good backend SHA to staging through the existing controlled Render action.
2. Deploy the matching known-good frontend SHA. Keep frontend/backend versions compatible.
3. Wait for the service health check to pass; then run:

   ```text
   STAGING_API_BASE=https://<staging-backend> \
   STAGING_BEARER_TOKEN=<temporary-staging-token> \
   STAGING_ORGANIZATION_ID=<staging-org> \
   STAGING_SAMPLE_ID=<staging-sample> \
   node scripts/staging-smoke.mjs
   ```

4. Verify auth with a valid fixture and missing/invalid credentials.
5. Verify organization-scoped project list/read and persistence using only the dedicated fixture.
6. Verify private sample retrieval, non-enumerating unauthorized access, and absence of public object URLs.
7. Record old/new SHAs, start/end UTC times, deploy results, smoke output, provider signals, and defects.
8. Reopen normal traffic only after health, auth, tenant, project, and audio checks pass.

## Database distinction

An application rollback changes deployed code and static assets. It does **not** undo database writes or restore database state. Use `backups.md` only for confirmed database corruption/loss and only into an isolated environment first.

## Abort and escalate

Abort if health remains failing, auth or tenant checks fail, audio authorization changes, or migration compatibility is unknown. Escalate to the release owner/security owner with the exact SHAs and evidence. Never delete production records or storage objects to make a rollback appear successful.
