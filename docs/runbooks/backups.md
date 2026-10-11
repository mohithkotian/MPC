# MPC Database Backup and Restore Runbook

**Owner:** MPC maintainers
**Reviewed:** 2026-10-11
**Current evidence:** **NOT RUN**. No authorized Supabase recovery environment or provider credentials were available during this implementation. Documentation and local tests do not count as a restore drill.

## Recovery objectives

RPO and RTO require product-owner approval. Until agreed, record them as `TBD` and do not promise a recovery time. Database restore does not restore private audio objects, secrets, Render configuration, or Supabase Auth state automatically.

## Verify backup/PITR configuration

In the correct non-production Supabase project, an authorized operator must confirm:

- automated backup retention and PITR availability;
- latest recoverable timestamp and retention boundary;
- project region and isolated recovery target;
- private Storage bucket backup/versioning policy;
- access to secrets and migration artifacts needed to start the application.

Record dashboard URLs, UTC timestamps, retention, and the operator. Do not copy credentials into this document.

## Isolated restore drill

1. Select a recovery point and record it. A point before recent writes may permanently discard those writes if used for production recovery.
2. Create a new isolated recovery project/database. Never overwrite staging or production.
3. Restore the database through the provider-supported process.
4. Run the repository migration status check and confirm the expected schema version.
5. Verify database connectivity using a restricted recovery credential.
6. Check RLS policies and prove two dedicated test users cannot read each other’s organization projects or samples.
7. Spot-check project records, organization memberships, sample metadata, and timestamps.
8. Configure a recovery-only application against the isolated database and separate storage fixtures. Verify health, auth, project persistence, and private audio authorization.
9. Record start/end UTC times, duration, recovery point, row/checksum checks, defects, and cleanup approval.
10. Destroy the isolated recovery resources only after evidence is exported to an approved location.

## Recovery decision

Prefer a forward-compatible application fix for deployment defects. Use database restore only for confirmed data corruption or loss, with explicit incident approval. Restoring an earlier point can discard writes made after that point; reconcile or communicate the write-loss window before resuming traffic.

## Drill record template

```text
Status: NOT RUN | PASS | FAIL
Recovery point (UTC):
Target environment:
Start/end (UTC):
Duration:
Schema/migration result:
RLS and tenant-isolation result:
Project/sample metadata result:
Application compatibility result:
Unresolved defects:
Operator and approver:
```
