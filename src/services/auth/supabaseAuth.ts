import { createClient, type AuthChangeEvent, type Session, type User, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;
function getClient(): SupabaseClient {
  if (client) return client;
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required for browser authentication.');
  client = createClient(url, anonKey, { auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true } });
  return client;
}
export type AuthState = { session: Session | null; user: User | null; emailVerified: boolean };
export function toAuthState(session: Session | null): AuthState { return { session, user: session?.user ?? null, emailVerified: Boolean(session?.user.email_confirmed_at) }; }
export const signUp = (email: string, password: string, redirectTo = window.location.origin) => getClient().auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
export const signIn = (email: string, password: string) => getClient().auth.signInWithPassword({ email, password });
export const signOut = () => getClient().auth.signOut();
export const sendPasswordReset = (email: string, redirectTo = `${window.location.origin}/reset-password`) => getClient().auth.resetPasswordForEmail(email, { redirectTo });
export const updatePassword = (password: string) => getClient().auth.updateUser({ password });
export const getSession = () => getClient().auth.getSession();
export const refreshSession = () => getClient().auth.refreshSession();
export const onAuthStateChange = (callback: (event: AuthChangeEvent, session: Session | null) => void) => getClient().auth.onAuthStateChange(callback);
export { getClient as getSupabaseClient };
