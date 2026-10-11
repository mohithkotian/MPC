# MPC Incident Response

**Owner:** MPC maintainers
**Reviewed:** 2026-10-11
**First rule:** preserve evidence, reduce impact, and do not make destructive changes while diagnosing.

## First five minutes

1. Declare the incident and record UTC start time, observed impact, current release SHA, and a safe contact channel.
2. Capture an example endpoint, status, `X-Request-Id`, timestamp, and sanitized response. Never copy tokens, cookies, authorization headers, or private object keys.
3. Check Render deploy history/logs, `/api/health`, Supabase status/logs, and Upstash status/metrics. Provider dashboard access and alert delivery are not configured by this repository.
4. Stop a suspect promotion. If the release is the likely cause and migrations remain compatible, use `rollback.md`; do not restore the database as a first response.
5. Escalate when tenant isolation, credential exposure, data loss, or uncertainty is involved.

## Symptom decision table

| Symptom | Immediate containment | Diagnostics | Recovery and verification |
|---|---|---|---|
| Backend deploy or readiness failure | Stop promotion; keep known-good service if possible | Render deploy logs, `/api/health`, startup configuration errors | Fix config/code or rollback; verify health, auth, projects, and audio |
| Frontend deploy failure | Keep prior static release; do not change backend | Render build logs and browser asset errors | Redeploy known-good frontend; verify login, API base, and playback |
| Auth failures or suspected auth bypass | Stop promotion; preserve request IDs; disable affected route only through approved platform controls | Compare `/api/auth/session`, Supabase Auth logs, sanitized `auth.*` events | Fix/rollback; test missing, invalid, expired, and valid credentials |
| Database outage/pool exhaustion | Stop write-heavy operations; do not delete records | Supabase database health, connection usage, query errors, request latency | Restore connectivity or scale within approved provider controls; verify RLS and project persistence |
| Migration failure | Stop deploy and traffic switch; do not run `down` blindly | Migration runner output and schema migration table | Apply a forward-compatible fix or restore only in an isolated environment; rerun verification |
| Upstash outage or rate-limit failures | Avoid disabling limits silently; apply approved temporary capacity policy | Provider status, rate-limit error logs/counters | Restore shared store; verify limits across two instances |
| Storage outage/broken playback | Preserve private bucket; do not make objects public | Storage provider status, `audio.storage_get_failed`, sample metadata | Restore provider access; verify authorization occurs before retrieval and playback works |
| Suspected tenant isolation or unauthorized sample access | Stop affected access path; preserve evidence; notify security owner | Reproduce with dedicated test users and request IDs; inspect catalog/RLS logs | Patch and add negative tests; rotate affected credentials if exposure is confirmed |
| Suspected secret exposure | Revoke/rotate exposed secret immediately through provider secret manager; do not paste it into tickets | Identify source, time range, logs and access history | Redeploy with rotated values; verify old credential fails and no secret appears in logs |

## Closure checklist

- Impact, timeline, release SHA, request IDs, and actions recorded.
- Authentication, tenant boundaries, project persistence, private audio, and health checks verified.
- No production data was deleted or restored without explicit authorization.
- Follow-up owner and deadline assigned for every defect.
- Review this runbook after use and correct any unverified command.
