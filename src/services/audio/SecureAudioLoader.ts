/**
 * Secure Audio Loader Client Service for Pulse MPC
 *
 * Fetches audio streams securely using Short-Lived Access Tokens (Bearer)
 * and automatically refreshes tokens via HttpOnly refresh cookie.
 */

const API_BASE = import.meta.env.VITE_API_BASE ?? "https://mpc-backend-latest.onrender.com";

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

    this.refreshPromise = fetch(`${API_BASE}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
    })
      .then(async (res) => {
        if (res.status === 401) {
          const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
            method: "POST",
            credentials: "include",
          });

          if (!loginRes.ok) {
            throw new Error("Failed to auto-login. Please refresh the page.");
          }

          const loginData = await loginRes.json();

          this.isRefreshing = false;
          this.accessToken = loginData.accessToken;

          return loginData.accessToken;
        }

        this.isRefreshing = false;

        if (!res.ok) {
          throw new Error("Session expired. Please log in again.");
        }

        const data = await res.json();

        this.accessToken = data.accessToken;

        return data.accessToken;
      })
      .finally(() => {
        this.isRefreshing = false;
        this.refreshPromise = null;  // Clear so next call starts fresh
      });

    return this.refreshPromise;
  }

  /**
   * Fetch sample stream securely with Bearer token,
   * handling automatic token refresh.
   */
  public async fetchAndDecryptSample(
    sampleId: string,
    isRetry = false
  ): Promise<ArrayBuffer> {
    if (!this.accessToken) {
      await this.refreshAccessToken();
    }

    const response = await fetch(
      `${API_BASE}/api/audio/stream/${encodeURIComponent(sampleId)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Cache-Control": "no-store",
        },
      }
    );

    if (!response.ok) {
      if (response.status === 401 && !isRetry) {
        await this.refreshAccessToken();
        return this.fetchAndDecryptSample(sampleId, true);
      }

      if (response.status === 429) {
        throw new Error(
          "Rate limit exceeded: Temporary ban applied for scraping behavior"
        );
      }

      throw new Error(
        `Failed to load audio stream for sample ${sampleId}: HTTP ${response.status}`
      );
    }

    return await response.arrayBuffer();
  }
}

export const secureAudioLoader = new SecureAudioLoaderService();