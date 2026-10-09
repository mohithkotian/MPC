# MPC Manual Setup Checklist

This checklist is deliberately separate from the code changes. The application cannot safely choose your providers, billing account, region, or production domain for you.

## 1. Choose the providers before Phase 1

For the first production version, use one managed Postgres provider, one Redis-compatible provider, one managed authentication provider, and one private S3-compatible object-storage provider. Keep them in the same region when practical.

The recommended low-operations shape is:

| Need | Choose one | Why it is needed |
|---|---|---|
| Identity | Clerk, Auth0, or Supabase Auth | Real users, email verification, password reset, OAuth, session lifecycle |
| Database | Supabase Postgres, Neon, Railway Postgres, or Render Postgres | Users, sessions, sample catalog, permissions, audit records |
| Shared limits/jobs | Upstash Redis or managed Redis | Rate limits and, later, background jobs across instances |
| Private samples | Cloudflare R2, AWS S3, or Supabase Storage | Durable private audio objects and backups |
| Error tracking | Sentry or equivalent | Stack traces and release health without logging secrets |

Do not create production resources until you have decided whether MPC is single-user or multi-user/organization-based. That decision changes the database schema and authorization model.

## 2. Generate secrets locally, then store them in the provider secret manager

Do not send secrets in chat or commit them. Generate only the server encryption key with a secret manager or local secret generator. Supabase URL and publishable key are configured separately and are not authentication secrets. Do not generate JWT signing secrets; MPC no longer signs custom JWTs. Confirm the encryption utilityâ€™s expected representation before using the hex output. The current repository has a mismatch between its documented 32-byte key and its incomplete/legacy sample scripts, so do not encrypt production samples until Phase 2 verifies this contract.

## 3. Create three isolated environments

Create separate **local**, **staging**, and **production** projects/resources. Do not point staging at production data. Use separate:

- authentication projects and callback URLs;
- Postgres databases;
- Redis instances or namespaces;
- object-storage buckets/prefixes;
- JWT/encryption secrets;
- Sentry projects and deployment credentials.

Record provider names, regions, retention, and monthly budget in `docs/hosting.md` when those decisions are made.

## 4. Configure the first production environment variables

The backend will eventually require at least:

```text
NODE_ENV=production
PORT=3000
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=<publishable-key>
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable-key>
SERVER_ENCRYPTION_KEY=<secret-manager-value>
ALLOWED_ORIGINS=https://your-real-frontend-domain.example
DATABASE_URL=<managed-postgres-url>
REDIS_URL=<managed-redis-url>
OBJECT_STORAGE_BUCKET=<private-bucket>
OBJECT_STORAGE_REGION=<region>
OBJECT_STORAGE_ENDPOINT=<provider-endpoint-if-required>
OBJECT_STORAGE_ACCESS_KEY_ID=<secret-manager-value>
OBJECT_STORAGE_SECRET_ACCESS_KEY=<secret-manager-value>
SENTRY_DSN=<server-side-dsn>
```

Do not add these variables to `.env.example` with real values. The exact names may be adjusted after the provider/auth ADR is approved.

## 5. Configure authentication manually

In the selected auth provider, create separate local/staging/production applications. Add only the real frontend callback/logout URLs for each environment. Enable email verification and password reset. Keep OAuth disabled until its callback and account-linking behavior are tested.

Before the application is allowed to create real users, verify that the provider can expose a stable subject/user ID and that removed users or revoked sessions can no longer call MPC APIs.

## 6. Configure database access manually

Create a dedicated database and restricted application role. Enable automated backups and point-in-time recovery if the provider supports it. Save the connection string only in the deployment secret manager. Do not run schema changes manually in the provider console; migrations will be committed and run through the deployment process.

Before production data exists, perform a restore drill into a separate database and record the result in `docs/runbooks/backups.md`.

## 7. Configure Redis manually

Create a private Redis instance with TLS if supported. Restrict network access and create a credential with only the permissions the application requires. The Redis namespace must be different for staging and production. The code will use it for distributed rate limiting; do not treat Redis as the source of truth for users, permissions, or sample ownership.

## 8. Configure private object storage manually

Create a private bucket. Disable public access and public listing. Configure encryption at rest, versioning where affordable, lifecycle/retention rules, and a backup or replication policy. Create an application credential that can read/write only the MPC bucket/prefix.

Use prefixes such as:

```text
local/samples/<object-id>
staging/samples/<object-id>
production/samples/<object-id>
```

Do not upload copyrighted or unlicensed samples. Confirm that every sample used in production is legally authorized for your intended use.

## 9. Configure native Render deployment manually

Create a Render Static Site for the frontend and a native Render Node Web Service for the backend. Do not use Docker, Docker Compose, Nginx, or Render Image Services for this topology. Set the backend health check to:

```text
GET /api/health
```

For the frontend, use `npm ci && npm run build` with `dist` as the publish directory. Set `VITE_API_BASE` to the native backend service URL and add the Render rewrite `/*` → `/index.html` with status `200` for SPA routes. For the backend, use `npm ci && npm run build:server` and start it with `npm run server`; Render supplies `PORT`.

Set the backend `ALLOWED_ORIGINS` value to the exact frontend origin. Do not use wildcard CORS. Configure a real domain, TLS, request timeout, memory/CPU limits, and billing alerts.

Production deployment must not happen until staging has passed authentication, cross-user authorization, sample delivery, rate-limit, backup-restore, and rollback tests.

## What you should do now

1. Decide whether MPC is single-user or organization/multi-tenant.
2. Select the authentication, Postgres, Redis, and object-storage providers.
3. Create local/staging/production resources, but do not upload production data yet.
4. Generate and store secrets in the provider secret manager.
5. Send back the provider choices and the deployment platform names, without sending any secret values.

Phase 2 implements Supabase Auth in the browser and Express Bearer verification. Apply migrations only through the existing migration runner in an explicitly approved database operation.
