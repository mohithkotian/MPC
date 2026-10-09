# Decision 0003: Native Render deployment

## Status

Accepted for the deployment phase; implementation is local-only and is not a deployment action.

## Decision

Deploy the Vite frontend as a Render Static Site and the Express backend as a native Render Node Web Service. The frontend calls the backend using the build-time `VITE_API_BASE` origin. Local development keeps the Vite `/api` proxy as a convenience when `VITE_API_BASE` is unset.

Docker, Docker Compose, and the Nginx reverse proxy are no longer part of the active deployment path.

## Preserved boundaries

- Supabase Auth remains the identity authority.
- The browser sends Supabase Bearer access tokens to Express.
- Express performs authentication and tenant/sample authorization before storage retrieval.
- Staging and production use the private Supabase Storage provider.
- No service-role key is exposed through `VITE_*` variables.
- Backend CORS remains explicitly configured through `ALLOWED_ORIGINS`; wildcard CORS is not used.

## Required Render configuration

### Frontend Static Site

- Build command: `npm ci && npm run build`
- Publish directory: `dist`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_BASE` set to the native backend service URL
- Rewrite: `/*` → `/index.html` with status `200`

### Backend Node Web Service

- Build command: `npm ci && npm run build:server`
- Start command: `npm run server`
- `NODE_ENV=staging` or `production`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `STORAGE_PROVIDER=supabase`
- `SUPABASE_STORAGE_BUCKET=samples`
- `SERVER_ENCRYPTION_KEY`
- `ALLOWED_ORIGINS` containing the exact frontend origin

Render supplies `PORT`; the server already uses it with a local fallback of `3000`.

## Deferred

Render dashboard configuration, deployment, database changes, Storage changes, and credential changes are intentionally deferred to the deployment operator.
