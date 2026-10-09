import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { RequestSupabaseClient } from '../supabase';

export interface SampleObject {
  body: Readable;
  contentType: string;
  contentLength?: number;
}

export interface SampleStorage {
  get(storageKey: string): Promise<SampleObject | null>;
}

export class StorageProviderError extends Error {
  public readonly cause: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'StorageProviderError';
    this.cause = cause;
  }
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const SAFE_FILENAME = new RegExp(`^${UUID}\\.mp3$`, 'i');
const TENANT_OBJECT_KEY = new RegExp(`^organizations/${UUID}/samples/${UUID}\\.mp3$`, 'i');
const PRESET_OBJECT_KEY = new RegExp(`^(?:presets/)?${UUID}\\.mp3$`, 'i');
const SUPPORTED_MP3_TYPES = new Set(['audio/mpeg', 'audio/mp3']);

export function isSafeStorageKey(storageKey: string): boolean {
  if (!storageKey || storageKey.includes('..') || storageKey.includes('\\0') || path.isAbsolute(storageKey)) return false;
  return SAFE_FILENAME.test(storageKey) || TENANT_OBJECT_KEY.test(storageKey) || PRESET_OBJECT_KEY.test(storageKey);
}

export class LocalSampleStorage implements SampleStorage {
  constructor(private readonly samplesDirectory: string) {}

  public async get(storageKey: string): Promise<SampleObject | null> {
    if (!SAFE_FILENAME.test(storageKey)) return null;
    const filePath = path.join(this.samplesDirectory, storageKey);
    try {
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) return null;
      return {
        body: createReadStream(filePath),
        contentType: 'audio/mpeg',
        contentLength: stat.size,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw new StorageProviderError('Local sample storage failed', error);
    }
  }
}

export class SupabaseStorage implements SampleStorage {
  constructor(
    private readonly client: RequestSupabaseClient,
    private readonly bucket: string,
  ) {}

  public async get(storageKey: string): Promise<SampleObject | null> {
    if (!isSafeStorageKey(storageKey)) return null;
    const { data, error } = await this.client.storage.from(this.bucket).download(storageKey);
    if (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || /not found/i.test(error.message)) return null;
      throw new StorageProviderError('Supabase Storage download failed', error);
    }
    if (!data) return null;
    const bytes = Buffer.from(await data.arrayBuffer());
    const providerContentType = data.type?.toLowerCase();
    return {
      body: Readable.from(bytes),
      contentType: providerContentType && SUPPORTED_MP3_TYPES.has(providerContentType)
        ? providerContentType
        : 'audio/mpeg',
      contentLength: bytes.byteLength,
    };
  }
}
