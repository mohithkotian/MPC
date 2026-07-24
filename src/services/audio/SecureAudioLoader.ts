/**
 * Secure Audio Loader Client Service for Pulse MPC
 * 
 * Fetches audio streams securely using Short-Lived Access Tokens (Bearer)
 * and automatically refreshes tokens via HttpOnly refresh cookie.
 */

export class SecureAudioLoaderService {
  private accessToken: string | null = null;
  private isRefreshing = false;
  private refreshPromise: Promise<string> | null = null;

  /**
   * Refreshes the short-lived access token using the HttpOnly refresh cookie
   */
  private async refreshAccessToken(): Promise<string> {
    if (this.isRefreshing && this.refreshPromise) {
      return this.refreshPromise;
    }

    this.isRefreshing = true;
    this.refreshPromise = fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include', // sends pulse_refresh HttpOnly cookie
    }).then(async (res) => {
      if (res.status === 401) {
        // Fallback: If refresh fails due to missing cookie, do an initial login
        const loginRes = await fetch('/api/auth/login', {
          method: 'POST',
          credentials: 'include',
        });
        if (!loginRes.ok) {
          throw new Error('Failed to auto-login. Please refresh the page.');
        }
        const loginData = await loginRes.json();
        this.isRefreshing = false;
        this.accessToken = loginData.accessToken;
        return loginData.accessToken;
      }
      
      this.isRefreshing = false;
      if (!res.ok) {
        throw new Error('Session expired. Please log in again.');
      }
      const data = await res.json();
      this.accessToken = data.accessToken;
      return data.accessToken;
    }).catch((err) => {
      this.isRefreshing = false;
      this.accessToken = null;
      throw err;
    });

    return this.refreshPromise;
  }

  /**
   * Fetch sample stream securely with Bearer token, handling auto-refresh
   */
  public async fetchAndDecryptSample(sampleId: string, isRetry = false): Promise<ArrayBuffer> {
    // Attempt to get token if missing
    if (!this.accessToken) {
      await this.refreshAccessToken();
    }

    const response = await fetch(`/api/audio/stream/${encodeURIComponent(sampleId)}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Cache-Control': 'no-store',
      },
    });

    if (!response.ok) {
      if (response.status === 401 && !isRetry) {
        // Token might have expired, try to refresh once
        await this.refreshAccessToken();
        return this.fetchAndDecryptSample(sampleId, true);
      }
      if (response.status === 429) {
        throw new Error('Rate limit exceeded: Temporary ban applied for scraping behavior');
      }
      throw new Error(`Failed to load audio stream for sample ${sampleId}: HTTP ${response.status}`);
    }

    return await response.arrayBuffer();
  }
}

export const secureAudioLoader = new SecureAudioLoaderService();
