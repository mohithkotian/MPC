import { Router, type Response } from 'express';
import fs from 'node:fs';
import { requireAuth, type AuthenticatedRequest } from './auth';
import { noCacheHeader, antiHotlink, audioRateLimiter, checkBlocklist } from '../middleware/security';
import { MANIFEST_PATH } from '../config';
import { createSampleStorage } from '../storage';
import { isSafeStorageKey, StorageProviderError, type SampleStorage } from '../storage/SampleStorage';

interface SampleManifestEntry {
  id: string;
  originalName: string;
  kitId: string;
  padIndex: number;
  filename: string;
}

export interface AuthorizedSample {
  storageKey: string;
}

type StorageFactory = (req: AuthenticatedRequest) => SampleStorage;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let manifestCache: Record<string, SampleManifestEntry> | null = null;

function getManifest(): Record<string, SampleManifestEntry> {
  if (manifestCache !== null) return manifestCache;
  if (!fs.existsSync(MANIFEST_PATH)) return {};
  try {
    manifestCache = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
    return manifestCache ?? {};
  } catch {
    return {};
  }
}

function resolvePresetSample(sampleId: string): AuthorizedSample | null {
  const manifest = getManifest();
  const directEntry = Object.prototype.hasOwnProperty.call(manifest, sampleId) ? manifest[sampleId] : undefined;
  if (directEntry && isSafeStorageKey(directEntry.filename)) return { storageKey: directEntry.filename };
  for (const entry of Object.values(manifest)) {
    const alias = `${entry.kitId}-pad${entry.padIndex + 1}`;
    if ((alias === sampleId || entry.id === sampleId || entry.id.startsWith(sampleId)) && isSafeStorageKey(entry.filename)) {
      return { storageKey: entry.filename };
    }
  }
  return null;
}

export async function authorizeTenantSample(req: AuthenticatedRequest): Promise<AuthorizedSample | null> {
  const sampleId = req.params.sampleId;
  if (!UUID_PATTERN.test(sampleId) || !req.supabase || !req.user) return null;
  const { data, error } = await req.supabase
    .from('samples')
    .select('organization_id, storage_key, status')
    .eq('id', sampleId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error || !data || data.status !== 'ready' || !isSafeStorageKey(data.storage_key)) return null;

  const { data: membership, error: membershipError } = await req.supabase
    .from('organization_members')
    .select('organization_id')
    .eq('organization_id', data.organization_id)
    .eq('user_id', req.user.id)
    .is('deleted_at', null)
    .maybeSingle();
  if (membershipError || !membership) return null;
  return { storageKey: data.storage_key };
}

async function authorizeSample(req: AuthenticatedRequest): Promise<AuthorizedSample | null> {
  const sampleId = req.params.sampleId;
  if (!UUID_PATTERN.test(sampleId)) return resolvePresetSample(sampleId);
  return authorizeTenantSample(req);
}

export async function authorizeThenCreateStorage(
  req: AuthenticatedRequest,
  storageFactory: StorageFactory,
): Promise<{ sample: AuthorizedSample; storage: SampleStorage } | null> {
  const sample = await authorizeSample(req);
  if (!sample) return null;
  return { sample, storage: storageFactory(req) };
}

export function createAudioRouter(storageFactory: StorageFactory = (req) => createSampleStorage(req.supabase!)): Router {
  const router = Router();
  router.use(noCacheHeader, antiHotlink);

  router.get('/manifest', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    const organizationId = req.header('x-organization-id');
    if (organizationId) {
      if (!UUID_PATTERN.test(organizationId)) { res.status(400).json({ error: 'x-organization-id must be a UUID' }); return; }
      const { data, error } = await req.supabase!.from('samples').select('id, original_name, kit_id, pad_index').eq('organization_id', organizationId).is('deleted_at', null).eq('status', 'ready');
      if (error) { res.status(502).json({ error: 'Unable to load sample catalog' }); return; }
      res.json(Object.fromEntries((data ?? []).map((sample) => [sample.id, { id: sample.id, kitId: sample.kit_id, padIndex: sample.pad_index, name: sample.original_name }])));
      return;
    }
    const manifest = getManifest();
    res.json(Object.fromEntries(Object.values(manifest).map((entry) => [entry.id, { id: entry.id, kitId: entry.kitId, padIndex: entry.padIndex, name: entry.originalName }])));
  });

  router.get('/stream/:sampleId', checkBlocklist, audioRateLimiter, requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    let authorized;
    try {
      authorized = await authorizeThenCreateStorage(req, storageFactory);
    } catch (error) {
      if (error instanceof StorageProviderError) { res.status(502).json({ error: 'Unable to retrieve sample' }); return; }
      res.status(500).json({ error: 'Unable to retrieve sample' });
      return;
    }
    if (!authorized) { res.status(404).json({ error: 'Sample not found' }); return; }

    let storedObject;
    try {
      storedObject = await authorized.storage.get(authorized.sample.storageKey);
    } catch (error) {
      if (error instanceof StorageProviderError) {
        res.status(502).json({ error: 'Unable to retrieve sample' });
        return;
      }
      res.status(500).json({ error: 'Unable to retrieve sample' });
      return;
    }
    if (!storedObject) { res.status(404).json({ error: 'Sample not found' }); return; }

    res.setHeader('Content-Type', storedObject.contentType);
    if (storedObject.contentLength !== undefined) res.setHeader('Content-Length', storedObject.contentLength);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Accept-Ranges', 'none');
    storedObject.body.on('error', () => { if (!res.headersSent) res.status(500).json({ error: 'Failed to stream audio' }); storedObject.body.destroy(); });
    res.on('close', () => storedObject.body.destroy());
    storedObject.body.pipe(res);
  });

  return router;
}

export const audioRouter = createAudioRouter();
