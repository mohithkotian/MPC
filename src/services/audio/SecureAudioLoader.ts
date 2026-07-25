/// <reference types="vite/client" />
/**
 * Secure Audio Loader Client Service for MPC
 *
 * Auth flow:
 *  1. Check sessionStorage for a cached access token
 *  2. If none → call /login directly (avoids pointless /refresh 401 on first visit)
 *  3. When token expires (401 on audio endpoint) → try /refresh (cookie), then /login
 */

// In production: nginx proxies /api/* → backend (same-origin, no CORS needed)
// In local dev: Vite proxies /api/* → backend (via vite.config.ts server.proxy)
// VITE_API_BASE can override for non-proxied setups (leave empty for proxy mode)
const API_BASE = import.meta.env.VITE_API_BASE ?? "";

const TOKEN_KEY = "mpc_access_token";

export class SecureAudioLoaderService {
  private accessToken: string | null = sessionStorage.getItem(TOKEN_KEY);
  private authPromise: Promise<string> | null = null;

  /**
   * Obtain a valid access token.
   * Tries /refresh (uses HttpOnly cookie if present), falls back to /login.
   * Deduplicates concurrent calls so only one auth round-trip happens at a time.
   */
  private getToken(): Promise<string> {
    if (this.authPromise) return this.authPromise;

    this.authPromise = this._fetchToken().finally(() => {
      this.authPromise = null;
    });

    return this.authPromise;
  }

  private async _fetchToken(): Promise<string> {
    // Try refresh first (works after first login, when the HttpOnly cookie exists)
    try {
      const res = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        this._storeToken(data.accessToken);
        return data.accessToken;
      }
    } catch {
      // Network error on refresh — fall through to login
    }

    // Refresh failed (no cookie yet, or expired) → auto-login
    const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });

    if (!loginRes.ok) {
      throw new Error(`Auto-login failed: HTTP ${loginRes.status}`);
    }

    const loginData = await loginRes.json();
    this._storeToken(loginData.accessToken);
    return loginData.accessToken;
  }

  private _storeToken(token: string): void {
    this.accessToken = token;
    sessionStorage.setItem(TOKEN_KEY, token);
  }

  private _clearToken(): void {
    this.accessToken = null;
    sessionStorage.removeItem(TOKEN_KEY);
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
      this.accessToken = await this.getToken();
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
        // Token expired — clear it and re-auth once
        this._clearToken();
        this.accessToken = await this.getToken();
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