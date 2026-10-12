import { getSession } from '../auth/supabaseAuth';
import { getActiveOrganizationId } from '../auth/organizationContext';

const API_BASE = (import.meta as ImportMeta & { env?: { VITE_API_BASE?: string } }).env?.VITE_API_BASE ?? '';

async function authContext(): Promise<{ token: string; organizationId: string }> {
  const { data, error } = await getSession();
  if (error || !data.session?.access_token) throw new Error('Cloud authentication is unavailable');
  const token = data.session.access_token;
  const organizationId = await getActiveOrganizationId(token);
  return { token, organizationId };
}

function url(path: string): string {
  return `${API_BASE.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

async function jsonRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { token } = await authContext();
  const response = await fetch(url(path), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || `Community request failed (${response.status})`);
  }
  return await response.json() as T;
}

export async function publishPadPack(name: string, description: string, pads: Array<{ index: number; name: string; blob: Blob }>): Promise<void> {
  const { token, organizationId } = await authContext();
  const createResponse = await fetch(url('/api/community/packs'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description, organizationId }),
  });
  if (!createResponse.ok) {
    const body = await createResponse.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || `Unable to create pack (${createResponse.status})`);
  }
  const { pack } = await createResponse.json() as { pack: { id: string } };

  try {
    for (const pad of pads) {
      const response = await fetch(url(`/api/community/packs/${pack.id}/pads/${pad.index}`), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'audio/wav',
          'X-Pad-Name': pad.name,
        },
        body: pad.blob,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error || `Unable to upload pad ${pad.index + 1}`);
      }
    }

    const publishResponse = await fetch(url(`/api/community/packs/${pack.id}/publish`), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    if (!publishResponse.ok) {
      const body = await publishResponse.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error || `Unable to publish pack (${publishResponse.status})`);
    }
  } catch (error) {
    throw error;
  }
}

export interface CommunityPack {
  id: string;
  name: string;
  description: string;
  owner_id: string;
  published_at: string;
  community_pads: Array<{ id: string; pad_index: number; name: string }>;
}

export async function listCommunityPacks(): Promise<CommunityPack[]> {
  const response = await jsonRequest<{ packs: CommunityPack[] }>('/api/community/packs');
  return response.packs ?? [];
}

export async function getCommunityPadUrl(padId: string): Promise<string> {
  const { token } = await authContext();
  const response = await fetch(url(`/api/community/pads/${padId}/stream`), { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Unable to load community pad (${response.status})`);
  return URL.createObjectURL(await response.blob());
}
