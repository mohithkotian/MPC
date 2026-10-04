import { Router, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { requireAuth, AuthenticatedRequest } from './auth';
import {
  noCacheHeader,
  antiHotlink,
  audioRateLimiter,
  checkBlocklist,
} from '../middleware/security';
import { SAMPLES_DIR, MANIFEST_PATH } from '../config';

export const audioRouter = Router();

// Apply security middleware
audioRouter.use(noCacheHeader);
audioRouter.use(antiHotlink);

interface SampleManifestEntry {
  id: string;
  originalName: string;
  kitId: string;
  padIndex: number;
  filename: string;
  iv: string;
  authTag: string;
}

let manifestCache: Record<string, SampleManifestEntry> | null = null;

function getManifest(): Record<string, SampleManifestEntry> {
  if (manifestCache !== null) {
    return manifestCache;
  }

  if (!fs.existsSync(MANIFEST_PATH)) {
    return {};
  }

  try {
    const raw = fs.readFileSync(MANIFEST_PATH, "utf-8");

    const manifest: Record<string, SampleManifestEntry> = JSON.parse(raw);

    manifestCache = manifest;

    return manifest;
  } catch (err) {
    console.error("[Manifest] Failed to load manifest.json:", err);
    return {};
  }
}

function resolveSampleEntry(
  manifest: Record<string, SampleManifestEntry>,
  queryId: string
): SampleManifestEntry | null {
  if (manifest[queryId]) {
    return manifest[queryId];
  }

  for (const entry of Object.values(manifest)) {
    const alias = `${entry.kitId}-pad${entry.padIndex + 1}`;

    if (alias === queryId || entry.id.startsWith(queryId)) {
      return entry;
    }
  }

  return null;
}

function isSafeSampleFilename(filename: string): boolean {
  return (
    path.basename(filename) === filename &&
    /^[a-f0-9-]+\.mp3$/i.test(filename)
  );
}

/**
 * GET /api/audio/manifest
 */
audioRouter.get(
  '/manifest',
  requireAuth,
  (_req: AuthenticatedRequest, res: Response) => {
    const manifest = getManifest();
    const publicManifest: Record<string, unknown> = {};

    for (const [id, entry] of Object.entries(manifest)) {
      publicManifest[id] = {
        id: entry.id,
        kitId: entry.kitId,
        padIndex: entry.padIndex,
        name: entry.originalName,
      };
    }

    res.json(publicManifest);
  }
);

/**
 * GET /api/audio/stream/:sampleId
 */
audioRouter.get(
  '/stream/:sampleId',
  checkBlocklist,
  audioRateLimiter,
  requireAuth,
  (req: AuthenticatedRequest, res: Response) => {
    const { sampleId } = req.params;

    const manifest = getManifest();
    const sampleEntry = resolveSampleEntry(manifest, sampleId);

    if (!sampleEntry) {
      return res.status(404).json({
        error: 'Sample not found',
      });
    }

    if (!isSafeSampleFilename(sampleEntry.filename)) {
      console.error('[Audio] Refusing to stream a file outside the samples directory');
      return res.status(404).json({
        error: 'Sample file missing',
      });
    }

    // The filename has been constrained to a basename with the expected MP3 format above.
    const filePath = path.join(SAMPLES_DIR, sampleEntry.filename); // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal, javascript.express.security.audit.express-path-join-resolve-traversal.express-path-join-resolve-traversal

    if (!fs.existsSync(filePath)) {
      console.error(`[Audio] Missing file: ${filePath}`);

      return res.status(404).json({
        error: 'Sample file missing',
      });
    }

    console.log(`[Audio] Streaming ${sampleEntry.filename}`);
    console.log(`[Audio] ${filePath}`);

    const stat = fs.statSync(filePath);

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Accept-Ranges', 'none');

    const stream = fs.createReadStream(filePath);

    stream.on('error', (err) => {
      console.error('[Audio Stream Error]', { sampleId, err });

      if (!res.headersSent) {
        res.status(500).json({
          error: 'Failed to stream audio',
        });
      }

      stream.destroy();
    });

    res.on('close', () => {
      stream.destroy();
    });

    stream.pipe(res);
  }
);
