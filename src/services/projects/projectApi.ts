import type { ProjectData } from '../../types';
import { getSession } from '../auth/supabaseAuth';
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

async function accessToken(): Promise<string> {
  const { data, error } = await getSession();
  if (error || !data.session?.access_token) throw new CloudProjectError(401, 'Cloud authentication is unavailable');
  return data.session.access_token;
}

async function organizationId(token: string): Promise<string> {
  const response = await fetch('/api/me/organizations', { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new CloudProjectError(response.status, 'Unable to determine organization access');
  const body = await response.json() as { organizations?: Array<{ id: string }> };
  const id = body.organizations?.[0]?.id;
  if (!id) throw new CloudProjectError(403, 'No active organization is available');
  return id;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken();
  const orgId = await organizationId(token);
  const response = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'x-organization-id': orgId,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    let message = 'Cloud project request failed';
    try { message = (await response.json() as { error?: string }).error ?? message; } catch { /* keep safe default */ }
    throw new CloudProjectError(response.status, message);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
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

export async function listCloudProjects(): Promise<ProjectData[]> {
  const body = await request<{ projects: CloudProjectRecord[] }>('/api/projects');
  return (body.projects ?? []).map(projectFromCloudRecord);
}

export async function saveCloudProject(project: ProjectData): Promise<ProjectData> {
  const isNew = project.id === 'default-project';
  const record = isNew
    ? await request<CloudProjectRecord>('/api/projects', { method: 'POST', body: JSON.stringify(toRecord(project)) })
    : await request<CloudProjectRecord>(`/api/projects/${encodeURIComponent(project.id)}`, { method: 'PATCH', body: JSON.stringify(toRecord(project)) });
  return projectFromCloudRecord(record);
}

export async function loadCloudProject(id: string): Promise<ProjectData> {
  const record = await request<CloudProjectRecord>(`/api/projects/${encodeURIComponent(id)}`);
  return projectFromCloudRecord(record);
}
