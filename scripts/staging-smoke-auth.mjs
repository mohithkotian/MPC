const AUTH_TIMEOUT_MS = 15_000;

function requiredString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isAllowedAnonKey(value) {
  if (!requiredString(value)) return false;
  const key = value.trim();
  if (key.startsWith('sb_publishable_')) return true;
  if (key.startsWith('sb_secret_')) return false;

  const parts = key.split('.');
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return payload?.role === 'anon';
  } catch {
    return false;
  }
}

function normalizeSupabaseUrl(value) {
  if (!requiredString(value)) throw new Error('Missing required staging Supabase configuration: STAGING_SUPABASE_URL');
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('STAGING_SUPABASE_URL must be a valid HTTPS URL');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    throw new Error('STAGING_SUPABASE_URL must be a project HTTPS origin without credentials, path, query, or fragment');
  }
  return url.origin;
}

export function validateStagingAuthConfig(config = {}) {
  const missing = [
    ['STAGING_SUPABASE_URL', config.supabaseUrl],
    ['STAGING_SUPABASE_ANON_KEY', config.anonKey],
    ['STAGING_TEST_USER_EMAIL', config.email],
    ['STAGING_TEST_USER_PASSWORD', config.password],
  ].filter(([, value]) => !requiredString(value)).map(([name]) => name);
  if (missing.length) throw new Error(`Missing required staging Supabase secrets: ${missing.join(', ')}`);

  const supabaseUrl = normalizeSupabaseUrl(config.supabaseUrl);
  if (!isAllowedAnonKey(config.anonKey)) {
    throw new Error('STAGING_SUPABASE_ANON_KEY must be a Supabase anon or publishable key; service-role and secret keys are forbidden');
  }

  return {
    supabaseUrl,
    anonKey: config.anonKey.trim(),
    email: config.email.trim(),
    password: config.password,
  };
}

export async function acquireStagingToken({
  supabaseUrl,
  anonKey,
  email,
  password,
  fetchImpl = globalThis.fetch,
  maskToken = () => {},
  now = Date.now,
}) {
  const config = validateStagingAuthConfig({ supabaseUrl, anonKey, email, password });
  let response;
  try {
    response = await fetchImpl(new URL('/auth/v1/token?grant_type=password', config.supabaseUrl), {
      method: 'POST',
      headers: {
        apikey: config.anonKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({ email: config.email, password: config.password }),
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
  } catch {
    throw new Error('Unable to reach staging Supabase Auth');
  }

  if (!response.ok) {
    throw new Error(`Supabase rejected staging test-account authentication (HTTP ${response.status})`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('Supabase returned an unreadable staging session');
  }

  const accessToken = payload?.access_token;
  if (typeof accessToken !== 'string' || accessToken.length === 0) {
    throw new Error('Supabase returned an invalid staging session');
  }

  // Register the token with the CI log masker immediately; never print or persist it.
  maskToken(accessToken);

  const expiresIn = Number(payload.expires_in);
  const nowSeconds = Math.floor(now() / 1000);
  const expiresAt = payload.expires_at === undefined
    ? nowSeconds + expiresIn
    : Number(payload.expires_at);
  if (String(payload.token_type ?? '').toLowerCase() !== 'bearer' ||
      !Number.isFinite(expiresIn) || expiresIn <= 0 ||
      !Number.isFinite(expiresAt) || expiresAt <= nowSeconds) {
    throw new Error('Supabase returned an expired or invalid staging session');
  }

  return { accessToken, expiresAt };
}

export async function verifyStagingSupabaseUser({
  supabaseUrl,
  anonKey,
  accessToken,
  expectedEmail,
  fetchImpl = globalThis.fetch,
}) {
  const url = normalizeSupabaseUrl(supabaseUrl);
  if (!isAllowedAnonKey(anonKey)) {
    throw new Error('STAGING_SUPABASE_ANON_KEY must be a Supabase anon or publishable key; service-role and secret keys are forbidden');
  }
  if (!requiredString(accessToken) || !requiredString(expectedEmail)) {
    throw new Error('Staging Supabase session verification configuration is incomplete');
  }

  let response;
  try {
    response = await fetchImpl(new URL('/auth/v1/user', url), {
      method: 'GET',
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${accessToken}`,
        accept: 'application/json',
      },
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
  } catch {
    throw new Error('Unable to verify the staging Supabase test-account session');
  }

  if (response.status === 401) throw new Error('Staging Supabase session is expired or invalid');
  if (!response.ok) throw new Error(`Staging Supabase user verification failed (HTTP ${response.status})`);

  let user;
  try {
    user = await response.json();
  } catch {
    throw new Error('Staging Supabase returned an unreadable user identity');
  }
  if (typeof user?.id !== 'string' || user.id.length === 0 ||
      typeof user?.email !== 'string' || user.email.trim().toLowerCase() !== expectedEmail.trim().toLowerCase()) {
    throw new Error('Supabase authenticated a different staging test account');
  }
  return { id: user.id };
}
