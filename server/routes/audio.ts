import { Router, Response } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { requireAuth, AuthenticatedRequest } from './auth';
import { noCacheHeader, antiHotlink, audioRateLimiter, checkBlocklist } from '../middleware/security';
import { JWT_SECRET, STREAM_TOKEN_EXPIRY, SAMPLES_DIR, MANIFEST_PATH, SERVER_ENCRYPTION_KEY } from '../config';
import { nonceStore } from '../services/nonceStore';
import { EncryptionService } from '../services/encryption';

export const audioRouter = Router();

// Apply security middlewares
audioRouter.use(noCacheHeader);
audioRouter.use(antiHotlink);

interface SampleManifestEntry {
  id: string;             // UUID
  originalName: string;   // e.g. "vocal1.mp3"
  kitId: string;          // "kit1", "kit2"
  padIndex: number;       // 0 - 15
  filename: string; // e.g. "59f30c7d-13df-424f-b93e-a8b41184cef3.mp3"
  iv: string;             // Base64
  authTag: string;        // Base64
}

let manifestCache: Record<string, SampleManifestEntry> | null = null;

function getManifest(): Record<string, SampleManifestEntry> {
  if (manifestCache) return manifestCache;
  if (!fs.existsSync(MANIFEST_PATH)) return {};
  try {
    const raw = fs.readFileSync(MANIFEST_PATH, 'utf-8');
    manifestCache = JSON.parse(raw);
    return manifestCache!;
  } catch (err) {
    console.error('Failed to read manifest.json:', err);
    return {};
  }
}

function resolveSampleEntry(manifest: Record<string, SampleManifestEntry>, queryId: string): SampleManifestEntry | null {
  if (manifest[queryId]) return manifest[queryId];
  
  for (const entry of Object.values(manifest)) {
    const alias = `${entry.kitId}-pad${entry.padIndex + 1}`;
    if (alias === queryId || entry.id.startsWith(queryId)) {
      return entry;
    }
  }
  return null;
}

/**
 * GET /api/audio/manifest
 * Returns obfuscated sample IDs mapped to pad kits
 */
audioRouter.get('/manifest', requireAuth, (_req: AuthenticatedRequest, res: Response) => {
  const manifest = getManifest();
  const publicManifest: Record<string, any> = {};

  for (const [id, entry] of Object.entries(manifest)) {
    publicManifest[id] = {
      id: entry.id,
      kitId: entry.kitId,
      padIndex: entry.padIndex,
      name: entry.originalName,
    };
  }

  res.json(publicManifest);
});

/**
 * GET /api/audio/stream/:sampleId
 * Streams the raw audio payload to authenticated client via access token.
 */
audioRouter.get('/stream/:sampleId', checkBlocklist, audioRateLimiter, requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { sampleId } = req.params;
  const manifest = getManifest();
  const sampleEntry = resolveSampleEntry(manifest, sampleId);

  if (!sampleEntry || !sampleEntry.filename) {
    res.status(404).json({ error: 'Sample not found' });
    return;
  }

  const filePath = path.join(SAMPLES_DIR, sampleEntry.filename);

  if (!fs.existsSync(filePath)) {
    console.error(`[Audio Error] Missing physical file for ${sampleId}`);
    res.status(404).json({ error: 'Sample file missing' });
    return;
  }

  // Enforce rigid response hardening headers
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', 'inline'); // Prevents "Save As" prompts
  res.setHeader('Accept-Ranges', 'none'); // Disable range requests to stop parallel download managers
  
  const stream = fs.createReadStream(filePath);
  stream.on('error', (err) => {
    console.error(`[Audio Stream Error] Failed streaming ${sampleId}:`, err);
    if (!res.headersSent) {
      res.status(500).end();
    }
  });

  stream.pipe(res);
});
