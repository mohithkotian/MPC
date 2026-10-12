import { Router, type Response } from 'express';
import { requireAuth, type AuthenticatedRequest } from './auth';
import { SUPABASE_STORAGE_BUCKET } from '../config';
import { noCacheHeader, audioRateLimiter, checkBlocklist } from '../middleware/security';
import { log, requestId } from '../observability';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const router = Router();
router.use(requireAuth);

router.get('/packs', async (req: AuthenticatedRequest, res: Response) => {
  const { data, error } = await req.supabase!
    .from('community_packs')
    .select('id, name, description, owner_id, published_at, created_at, community_pads(id, pad_index, name)')
    .not('published_at', 'is', null)
    .is('deleted_at', null)
    .order('published_at', { ascending: false });
  if (error) {
    res.status(502).json({ error: 'Unable to load community packs' });
    return;
  }
  res.json({ packs: data ?? [] });
});

router.post('/packs', async (req: AuthenticatedRequest, res: Response) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
  const organizationId = typeof req.body?.organizationId === 'string' ? req.body.organizationId : '';

  if (!name || name.length > 120 || description.length > 500 || !UUID.test(organizationId)) {
    res.status(400).json({ error: 'Invalid community pack metadata' });
    return;
  }

  const { data: membership, error: membershipError } = await req.supabase!
    .from('organization_members')
    .select('organization_id')
    .eq('organization_id', organizationId)
    .eq('user_id', req.user!.id)
    .is('deleted_at', null)
    .maybeSingle();
  if (membershipError || !membership) {
    res.status(403).json({ error: 'Organization access denied' });
    return;
  }

  const { data, error } = await req.supabase!
    .from('community_packs')
    .insert({ organization_id: organizationId, owner_id: req.user!.id, name, description })
    .select('id, name, description, published_at')
    .single();
  if (error || !data) {
    res.status(502).json({ error: 'Unable to create community pack' });
    return;
  }
  res.status(201).json({ pack: data });
});

router.post('/packs/:packId/pads/:padIndex', expressRawWav, async (req: AuthenticatedRequest, res: Response) => {
  const packId = req.params.packId;
  const padIndex = Number(req.params.padIndex);
  const padName = typeof req.header('x-pad-name') === 'string' ? req.header('x-pad-name')!.trim() : `PAD ${padIndex + 1}`;

  if (!UUID.test(packId) || !Number.isInteger(padIndex) || padIndex < 0 || padIndex > 15 || !padName || padName.length > 80) {
    res.status(400).json({ error: 'Invalid pad upload parameters' });
    return;
  }

  const body = req.body as Buffer;
  if (!Buffer.isBuffer(body) || body.length === 0 || body.length > 10 * 1024 * 1024) {
    res.status(400).json({ error: 'WAV body is required and must be <= 10 MB' });
    return;
  }

  const { data: pack, error: packError } = await req.supabase!
    .from('community_packs')
    .select('id, owner_id, deleted_at')
    .eq('id', packId)
    .maybeSingle();
  if (packError || !pack || pack.owner_id !== req.user!.id || pack.deleted_at) {
    res.status(403).json({ error: 'Community pack access denied' });
    return;
  }

  const storageKey = `community/${packId}/${crypto.randomUUID()}.wav`;
  const { error: uploadError } = await req.supabase!.storage.from(SUPABASE_STORAGE_BUCKET!).upload(storageKey, body, {
    contentType: 'audio/wav',
    upsert: false,
  });
  if (uploadError) {
    res.status(502).json({ error: 'Unable to store pad audio' });
    return;
  }

  const { data: pad, error: insertError } = await req.supabase!
    .from('community_pads')
    .insert({ pack_id: packId, pad_index: padIndex, name: padName, storage_key: storageKey, content_type: 'audio/wav', byte_size: body.length })
    .select('id, pad_index, name')
    .single();
  if (insertError || !pad) {
    await req.supabase!.storage.from(SUPABASE_STORAGE_BUCKET!).remove([storageKey]).catch(() => undefined);
    res.status(502).json({ error: 'Unable to register pad audio' });
    return;
  }

  res.status(201).json({ pad });
});

router.post('/packs/:packId/publish', async (req: AuthenticatedRequest, res: Response) => {
  const packId = req.params.packId;
  if (!UUID.test(packId)) { res.status(400).json({ error: 'Invalid pack id' }); return; }

  const { data, error } = await req.supabase!
    .from('community_packs')
    .update({ published_at: new Date().toISOString() })
    .eq('id', packId)
    .eq('owner_id', req.user!.id)
    .is('deleted_at', null)
    .select('id, name, description, published_at')
    .single();
  if (error || !data) { res.status(403).json({ error: 'Unable to publish community pack' }); return; }
  res.json({ pack: data });
});

router.get('/pads/:padId/stream', checkBlocklist, audioRateLimiter, noCacheHeader, async (req: AuthenticatedRequest, res: Response) => {
  const padId = req.params.padId;
  if (!UUID.test(padId)) { res.status(404).json({ error: 'Pad not found' }); return; }

  const { data, error } = await req.supabase!
    .from('community_pads')
    .select('storage_key, content_type, community_packs!inner(published_at, deleted_at)')
    .eq('id', padId)
    .maybeSingle();
  if (error || !data) { res.status(404).json({ error: 'Pad not found' }); return; }

  const pack = Array.isArray(data.community_packs) ? data.community_packs[0] : data.community_packs;
  if (!pack || pack.deleted_at || !pack.published_at) { res.status(404).json({ error: 'Pad not found' }); return; }

  const { data: file, error: storageError } = await req.supabase!.storage.from(SUPABASE_STORAGE_BUCKET!).download(data.storage_key);
  if (storageError || !file) {
    log('warn', 'community.pad_download_failed', { requestId: requestId(req), padId });
    res.status(404).json({ error: 'Pad audio not found' });
    return;
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  res.setHeader('Content-Type', data.content_type);
  res.setHeader('Content-Length', bytes.length);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(bytes);
});

function expressRawWav(req: AuthenticatedRequest, res: Response, next: () => void): void {
  const contentType = (req.header('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (contentType !== 'audio/wav' && contentType !== 'audio/x-wav') {
    res.status(415).json({ error: 'Content-Type must be audio/wav' });
    return;
  }
  const chunks: Buffer[] = [];
  let size = 0;
  req.on('data', (chunk: Buffer) => {
    size += chunk.length;
    if (size <= 10 * 1024 * 1024) chunks.push(Buffer.from(chunk));
  });
  req.on('end', () => {
    if (size > 10 * 1024 * 1024) { res.status(413).json({ error: 'WAV body too large' }); return; }
    req.body = Buffer.concat(chunks);
    next();
  });
  req.on('error', () => res.status(400).json({ error: 'Invalid WAV upload' }));
}

export const communityRouter = router;
