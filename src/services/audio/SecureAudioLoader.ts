import { getSupabaseClient } from '../auth/supabaseAuth';
const API_BASE = import.meta.env.VITE_API_BASE ?? '';
export class SecureAudioLoaderService {
  public async fetchAndDecryptSample(sampleId: string, isRetry = false): Promise<ArrayBuffer> {
    const { data, error } = await getSupabaseClient().auth.getSession();
    if (error || !data.session) throw new Error('You must be signed in to load audio.');
    const response = await this.fetchWithToken(sampleId, data.session.access_token);
    if (response.status === 401 && !isRetry) {
      const refreshed = await getSupabaseClient().auth.refreshSession();
      if (refreshed.error || !refreshed.data.session) throw new Error('Your session has expired.');
      return this.readResponse(await this.fetchWithToken(sampleId, refreshed.data.session.access_token), sampleId);
    }
    return this.readResponse(response, sampleId);
  }
  private fetchWithToken(sampleId: string, token: string): Promise<Response> { return fetch(`${API_BASE}/api/audio/stream/${encodeURIComponent(sampleId)}`, { headers: { Authorization: `Bearer ${token}`, 'Cache-Control': 'no-store' } }); }
  private async readResponse(response: Response, sampleId: string): Promise<ArrayBuffer> {
    if (response.status === 429) throw new Error('Rate limit exceeded: Temporary ban applied for scraping behavior');
    if (!response.ok) throw new Error(`Failed to load audio stream for sample ${sampleId}: HTTP ${response.status}`);
    return response.arrayBuffer();
  }
}
export const secureAudioLoader = new SecureAudioLoaderService();
