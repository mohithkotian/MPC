import { Router, type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import type { User } from '@supabase/supabase-js';
import { createRequestSupabaseClient, verifyAccessToken, type RequestSupabaseClient } from '../supabase';

export interface AuthenticatedRequest extends Request {
  user?: User;
  supabase?: RequestSupabaseClient;
}
export const authRouter = Router();
authRouter.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false }));
function getBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  return header && /^Bearer\s+\S+$/.test(header) ? header.slice(7).trim() : null;
}
export async function bootstrapProfile(client: RequestSupabaseClient, user: User): Promise<void> {
  const { error } = await client.from('profiles').upsert({ id: user.id }, { onConflict: 'id', ignoreDuplicates: true });
  if (error) throw new Error(`Profile bootstrap failed: ${error.message}`);
}
export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const token = getBearerToken(req);
  if (!token) { res.status(401).json({ error: 'Unauthorized: Bearer token required' }); return; }
  try {
    const user = await verifyAccessToken(token);
    const client = createRequestSupabaseClient(token);
    await bootstrapProfile(client, user);
    req.user = user;
    req.supabase = client;
    next();
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.startsWith('Profile bootstrap failed:')) {
      res.status(503).json({ error: 'Unable to initialize profile' });
      return;
    }
    res.status(401).json({ error: 'Unauthorized: Invalid or expired access token' });
  }
}
function currentUser(req: AuthenticatedRequest): User {
  if (!req.user) throw new Error('Verified user missing from request');
  return req.user;
}
export const meRouter = Router();
meRouter.use(requireAuth);
meRouter.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = currentUser(req);
    const { data, error } = await req.supabase!.from('profiles').select('id, display_name, avatar_url, created_at, updated_at').eq('id', user.id).maybeSingle();
    if (error) throw error;
    if (!data) { res.status(409).json({ error: 'Profile bootstrap is not complete' }); return; }
    res.json({ ...data, email: user.email ?? null, emailVerified: Boolean(user.email_confirmed_at) });
  } catch {
    res.status(502).json({ error: 'Unable to load profile' });
  }
});
meRouter.get('/organizations', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data, error } = await req.supabase!.from('organizations').select('id, name, slug, organization_members!inner(role)').order('name', { ascending: true });
    if (error) throw error;
    res.json({ organizations: data ?? [] });
  } catch {
    res.status(502).json({ error: 'Unable to load organizations' });
  }
});
authRouter.get('/session', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = currentUser(req);
  res.json({ user: { id: user.id, email: user.email ?? null, emailVerified: Boolean(user.email_confirmed_at) } });
});
