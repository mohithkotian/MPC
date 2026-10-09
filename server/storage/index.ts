import { MANIFEST_PATH, SAMPLES_DIR, STORAGE_PROVIDER, SUPABASE_STORAGE_BUCKET } from '../config';
import type { RequestSupabaseClient } from '../supabase';
import { LocalSampleStorage, SupabaseStorage, type SampleStorage } from './SampleStorage';

const localStorage = new LocalSampleStorage(SAMPLES_DIR);

export function createSampleStorage(client: RequestSupabaseClient): SampleStorage {
  if (STORAGE_PROVIDER === 'local') return localStorage;
  if (!SUPABASE_STORAGE_BUCKET) {
    throw new Error('Supabase Storage bucket is not configured');
  }
  return new SupabaseStorage(client, SUPABASE_STORAGE_BUCKET);
}

export { MANIFEST_PATH, LocalSampleStorage, SupabaseStorage };
export type { SampleStorage } from './SampleStorage';
