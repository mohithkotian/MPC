# ADR 0003: Supabase Auth Phase 2

## Decision

Supabase Auth is the identity authority for MPC. The browser uses `@supabase/supabase-js` for email/password signup and login, email-verification state, session restoration and refresh, logout, password reset, and password update.

The Express API accepts only `Authorization: Bearer <access_token>`. It verifies every token with `supabase.auth.getUser(accessToken)`, derives identity from the verified user, and creates a request-scoped Supabase client carrying that same caller token. The API never trusts a client-supplied user ID, role, or username.

Profile bootstrap is performed idempotently by the authenticated application flow with the verified `auth.uid()`. Migration `0002_auth_profile_bootstrap` adds only the RLS policy that permits a user to insert their own profile row; it does not create an `auth.users` trigger.

## Consequences

- Supabase owns session refresh and revocation; MPC does not issue JWTs or refresh cookies.
- Protected profile, organization, and sample queries remain subject to Supabase RLS and explicit organization/sample scoping.
- Local API tests mock the Supabase HTTP contract and do not connect to a Supabase project.
- Audio authorization must complete before local storage lookup or file retrieval.
