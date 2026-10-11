# ADR 0008: Phase 5.7 observability and operational evidence

- **Status:** Accepted for local implementation; external verification pending
- **Date:** 2026-10-11

## Decision

MPC uses one shared Express observability boundary for request IDs, structured redacted logs, and bounded local counters. Request IDs are returned as `X-Request-Id`; logs may carry request-level detail, while metric labels use bounded route templates or mounted route names. No provider-specific monitoring SDK or new cloud service is introduced in Phase 5.7.

Operational procedures live under `docs/runbooks/`, and `scripts/staging-smoke.mjs` is the single staging smoke-test entry point. Provider dashboards and alert delivery remain external configuration. The application’s in-process counters are diagnostic only and are not evidence of distributed metrics across Render instances.

## Consequences

- Operators can correlate an HTTP response with sanitized logs without exposing credentials or storage keys.
- Local tests can verify the boundary without requiring staging access.
- Production still requires Render/Supabase/Upstash dashboard configuration, alert testing, a real isolated restore drill, and a staging rollback rehearsal.
- Phase 5.7 does not claim production readiness while those external gates and the historical sample-binary issue remain open.
