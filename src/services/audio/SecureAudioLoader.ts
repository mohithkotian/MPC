import { getSupabaseClient } from '../auth/supabaseAuth';
import { getActiveOrganizationId, OrganizationContextError, organizationRequestHeaders } from '../auth/organizationContext';
const API_BASE = ((import.meta as ImportMeta & { env?: { VITE_API_BASE?: string } }).env?.VITE_API_BASE ?? '').replace(/\/+$/, '');
export class SecureAudioLoaderService {
  public async fetchAndDecryptSample(sampleId: string, isRetry = false): Promise<ArrayBuffer> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) throw new Error('You must be signed in to load audio.');
    let accessToken = data.session.access_token;
    let hasRetried = isRetry;
    let activeOrganizationId: string;
    try {
      activeOrganizationId = await getActiveOrganizationId(accessToken);
    } catch (organizationError) {
      if (organizationError instanceof OrganizationContextError && organizationError.status === 401 && !hasRetried) {
        const refreshed = await supabase.auth.refreshSession();
        if (refreshed.error || !refreshed.data.session) throw new Error('Your session has expired.');
        accessToken = refreshed.data.session.access_token;
        hasRetried = true;
        try {
          activeOrganizationId = await getActiveOrganizationId(accessToken);
        } catch (refreshOrganizationError) {
          throw this.organizationAccessError(refreshOrganizationError);
        }
      } else {
        throw this.organizationAccessError(organizationError);
      }
    }
    const response = await this.fetchWithToken(sampleId, accessToken, activeOrganizationId);
    if (response.status === 401 && !hasRetried) {
      const refreshed = await supabase.auth.refreshSession();
      if (refreshed.error || !refreshed.data.session) throw new Error('Your session has expired.');
      return this.readResponse(await this.fetchWithToken(sampleId, refreshed.data.session.access_token, activeOrganizationId), sampleId);
    }
    return this.readResponse(response, sampleId);
  }
  private organizationAccessError(error: unknown): Error {
    if (error instanceof OrganizationContextError && error.status === 403) {
      return new Error('No active organization is available to load audio.');
    }
    return new Error('Unable to determine organization access for audio.');
  }
  private fetchWithToken(sampleId: string, token: string, organizationId: string): Promise<Response> {
    return fetch(`${API_BASE}/api/audio/stream/${encodeURIComponent(sampleId)}`, {
      headers: { ...organizationRequestHeaders(token, organizationId), 'Cache-Control': 'no-store' },
    });
  }
  private async readResponse(response: Response, sampleId: string): Promise<ArrayBuffer> {
    if (response.status === 429) throw new Error('Rate limit exceeded: Temporary ban applied for scraping behavior');
    if (!response.ok) throw new Error(`Failed to load audio stream for sample ${sampleId}: HTTP ${response.status}`);
    return response.arrayBuffer();
  }
}
export const secureAudioLoader = new SecureAudioLoaderService();
