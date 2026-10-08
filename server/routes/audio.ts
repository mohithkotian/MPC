import { Router, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { requireAuth, type AuthenticatedRequest } from './auth';
import { noCacheHeader, antiHotlink, audioRateLimiter, checkBlocklist } from '../middleware/security';
import { SAMPLES_DIR } from '../config';
export const audioRouter = Router();
audioRouter.use(noCacheHeader, antiHotlink);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function storageFilename(storageKey: string): string | null {
  const filename = path.basename(storageKey);
  return filename === storageKey && /^[a-f0-9-]+\.mp3$/i.test(filename) ? filename : null;
}
async function authorizedSample(req: AuthenticatedRequest): Promise<{ filename: string } | null> {
  const organizationId = req.header('x-organization-id');
  const sampleId = req.params.sampleId;
  if (!organizationId || !UUID_PATTERN.test(organizationId) || !UUID_PATTERN.test(sampleId)) return null;
  const { data, error } = await req.supabase!.from('samples')
    .select('storage_key, status').eq('id', sampleId).eq('organization_id', organizationId)
    .is('deleted_at', null).maybeSingle();
  if (error || !data || data.status !== 'ready') return null;
  const filename = storageFilename(data.storage_key);
  return filename ? { filename } : null;
}
audioRouter.get('/manifest', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const organizationId = req.header('x-organization-id');
  if (!organizationId || !UUID_PATTERN.test(organizationId)) { res.status(400).json({ error: 'x-organization-id must be a UUID' }); return; }
  const { data, error } = await req.supabase!.from('samples').select('id, original_name, kit_id, pad_index').eq('organization_id', organizationId).is('deleted_at', null).eq('status', 'ready');
  if (error) { res.status(502).json({ error: 'Unable to load sample catalog' }); return; }
  res.json(Object.fromEntries((data ?? []).map((sample) => [sample.id, { id: sample.id, kitId: sample.kit_id, padIndex: sample.pad_index, name: sample.original_name }])));
});
audioRouter.get('/stream/:sampleId', checkBlocklist, audioRateLimiter, requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const sample = await authorizedSample(req);
  if (!sample) { res.status(404).json({ error: 'Sample not found' }); return; }
  const filePath = path.join(SAMPLES_DIR, sample.filename);
  if (!fs.existsSync(filePath)) { res.status(404).json({ error: 'Sample file missing' }); return; }
  const stat = fs.statSync(filePath);
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Accept-Ranges', 'none');
  const stream = fs.createReadStream(filePath);
  stream.on('error', () => { if (!res.headersSent) res.status(500).json({ error: 'Failed to stream audio' }); stream.destroy(); });
  res.on('close', () => stream.destroy());
  stream.pipe(res);
});
