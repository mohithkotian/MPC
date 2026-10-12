import type { ProjectData } from '../../types';
import { getSession } from '../auth/supabaseAuth';
import { getActiveOrganizationId, OrganizationContextError, organizationRequestHeaders } from '../auth/organizationContext';
import { projectFromCloudRecord, serializeProject } from './projectSerialization';

export class CloudProjectError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'CloudProjectError';
  }
}

type CloudProjectRecord = {
  id: string;
  name: string;
  artist: string;
  bpm: number;
  swing: number;
  volume: number;
  bank: string;
  snapshot: unknown;
  createdAt: string;
  updatedAt: string;
};

type CloudProjectApiDependencies = {
  apiBase?: string;
  fetcher?: typeof fetch;
  getAccessToken?: () => Promise<string>;
};

const configuredApiBase = (import.meta as ImportMeta & { env?: { VITE_API_BASE?: string } }).env?.VITE_API_BASE ?? '';

export function projectApiUrl(path: string, apiBase = configuredApiBase): string {
  const base = apiBase.trim().replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

async function accessToken(): Promise<string> {
  const { data, error } = await getSession();
  if (error || !data.session?.access_token) throw new CloudProjectError(401, 'Cloud authentication is unavailable');
  return data.session.access_token;
}

export function createCloudProjectApi(dependencies: CloudProjectApiDependencies = {}) {
  const fetcher = dependencies.fetcher ?? fetch;
  const getToken = dependencies.getAccessToken ?? accessToken;
  const apiBase = dependencies.apiBase ?? configuredApiBase;

  async function organizationId(token: string): Promise<string> {
    let response: Response;
    try {
      response = await fetcher(projectApiUrl('/api/me/organizations', apiBase), {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      throw new CloudProjectError(0, 'Unable to determine organization access');
    }
    if (!response.ok) throw new CloudProjectError(response.status, 'Unable to determine organization access');
    try {
      const body = await response.json() as { organizations?: Array<{ id?: unknown }> };
      const id = body.organizations?.[0]?.id;
      if (typeof id !== 'string' || !id) throw new CloudProjectError(403, 'No active organization is available');
      return id;
    } catch (error) {
      if (error instanceof CloudProjectError) throw error;
      throw new CloudProjectError(response.status, 'Unable to determine organization access');
    }
  }

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await getToken();
    const orgId = await organizationId(token);
    const headers = new Headers({
      Authorization: `Bearer ${token}`,
      'x-organization-id': orgId,
      'Content-Type': 'application/json',
    });
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));

    let response: Response;
    try {
      response = await fetcher(projectApiUrl(path, apiBase), { ...init, headers });
    } catch {
      throw new CloudProjectError(0, 'Cloud project service is unavailable');
    }

    if (!response.ok) {
      let message = 'Cloud project request failed';
      try {
        const body = await response.json() as { error?: unknown };
        if (typeof body.error === 'string' && body.error.trim()) message = body.error;
      } catch { /* non-JSON provider errors use a safe fallback */ }
      throw new CloudProjectError(response.status, message);
    }
    if (response.status === 204) return undefined as T;
    try {
      return await response.json() as T;
    } catch {
      throw new CloudProjectError(response.status, 'Cloud project service returned an invalid response');
    }
  }

  function toRecord(project: ProjectData): Omit<CloudProjectRecord, 'id' | 'createdAt' | 'updatedAt'> {
    return {
      name: project.name,
      artist: project.artist,
      bpm: project.bpm,
      swing: project.swing,
      volume: project.masterVolume,
      bank: project.activeBank,
      snapshot: serializeProject(project),
    };
  }

  return {
    async list(): Promise<ProjectData[]> {
      const body = await request<{ projects: CloudProjectRecord[] }>('/api/projects');
      return (body.projects ?? []).map(projectFromCloudRecord);
    },
    async save(project: ProjectData): Promise<ProjectData> {
      const isNew = project.id === 'default-project';
      const record = isNew
        ? await request<CloudProjectRecord>('/api/projects', { method: 'POST', body: JSON.stringify(toRecord(project)) })
        : await request<CloudProjectRecord>(`/api/projects/${encodeURIComponent(project.id)}`, { method: 'PATCH', body: JSON.stringify(toRecord(project)) });
      return projectFromCloudRecord(record);
    },
    async load(id: string): Promise<ProjectData> {
      const record = await request<CloudProjectRecord>(`/api/projects/${encodeURIComponent(id)}`);
      return projectFromCloudRecord(record);
    },
    async delete(id: string): Promise<void> {
      await request<void>(`/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' });
    },
  };
}

const cloudProjectApi = createCloudProjectApi();
export const listCloudProjects = () => cloudProjectApi.list();
export const saveCloudProject = (project: ProjectData) => cloudProjectApi.save(project);
export const loadCloudProject = (id: string) => cloudProjectApi.load(id);
export const deleteCloudProject = (id: string) => cloudProjectApi.delete(id);
