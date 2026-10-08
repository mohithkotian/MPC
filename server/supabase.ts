import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config';

export type RequestSupabaseClient = SupabaseClient;

export function createRequestSupabaseClient(accessToken: string): RequestSupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

export async function verifyAccessToken(accessToken: string): Promise<User> {
  const client = createRequestSupabaseClient(accessToken);
  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user) {
    throw new Error('Invalid or expired Supabase access token');
  }
  return data.user;
}
