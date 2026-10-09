# Supabase Auth setup

Set the same Supabase project URL and publishable/anon key in the server and Vite variables shown in `.env.example`. Never use a service-role key in the browser or commit either value.

Enable email/password authentication, email confirmation, and password reset redirects in the Supabase dashboard. The application exposes browser helpers for signup, password login, verification state, session restoration, automatic refresh, logout, reset email, and password update.

The API endpoints are:

- `GET /api/auth/session` — returns the verified Supabase user and email-verification state.
- `GET /api/me` — bootstraps the verified user profile idempotently and returns the profile.
- `GET /api/me/organizations` — returns only organizations visible to the caller’s request-scoped Supabase client.
- `GET /api/audio/manifest` and `/api/audio/stream/:sampleId` — require a Bearer token and `x-organization-id`; authorization is checked before any local file access.

No endpoint accepts a username, user ID, role, or refresh cookie as proof of identity. Do not run migrations or connect a staging project from local tests; apply committed migrations through the existing migration runner during a separately approved database operation.
