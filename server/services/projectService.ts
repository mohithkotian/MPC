import type { User } from '@supabase/supabase-js';
import type { RequestSupabaseClient } from '../supabase';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BANKS = new Set(['A', 'B', 'C', 'D']);
const MAX_SNAPSHOT_BYTES = 256 * 1024;
const PROJECT_FIELDS = new Set(['name', 'artist', 'bpm', 'swing', 'volume', 'bank', 'snapshot']);
const FORBIDDEN_SNAPSHOT_KEYS = new Set(['audioBuffer', 'customSamples', 'mediaPipe', 'runtime', 'functions']);

export type ProjectRole = 'owner' | 'admin' | 'member' | 'viewer';
export type ProjectInput = {
  name: string;
  artist: string;
  bpm: number;
  swing: number;
  volume: number;
  bank: string;
  snapshot: Record<string, unknown>;
};
export type ProjectRecord = ProjectInput & {
  id: string;
  organization_id: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export class ProjectServiceError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ProjectServiceError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function containsForbiddenSnapshotValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenSnapshotValue);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([key, nested]) => FORBIDDEN_SNAPSHOT_KEYS.has(key) || containsForbiddenSnapshotValue(nested));
}

function validateSnapshot(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new ProjectServiceError(400, 'snapshot must be an object');
  if (containsForbiddenSnapshotValue(value)) throw new ProjectServiceError(400, 'snapshot contains runtime-only project data');
  let serialized: string;
  try { serialized = JSON.stringify(value); } catch { throw new ProjectServiceError(400, 'snapshot must be valid JSON'); }
  if (!serialized || Buffer.byteLength(serialized, 'utf8') > MAX_SNAPSHOT_BYTES) {
    throw new ProjectServiceError(400, 'snapshot exceeds the maximum allowed size');
  }
  if (!isRecord(value.banks) || !isRecord(value.patterns)) {
    throw new ProjectServiceError(400, 'snapshot must contain banks and patterns');
  }
  return value;
}

function requiredString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw new ProjectServiceError(400, `${field} is invalid`);
  }
  return value.trim();
}

function numberInRange(value: unknown, field: string, min: number, max: number, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    throw new ProjectServiceError(400, `${field} is invalid`);
  }
  return value;
}

export function validateProjectInput(body: unknown): ProjectInput {
  if (!isRecord(body)) throw new ProjectServiceError(400, 'request body must be an object');
  const unknownFields = Object.keys(body).filter((key) => !PROJECT_FIELDS.has(key));
  if (unknownFields.length > 0) throw new ProjectServiceError(400, 'request contains unknown fields');
  return {
    name: requiredString(body.name, 'name', 120),
    artist: typeof body.artist === 'string' && body.artist.length <= 120 ? body.artist.trim() : (() => { throw new ProjectServiceError(400, 'artist is invalid'); })(),
    bpm: numberInRange(body.bpm, 'bpm', 40, 240, true),
    swing: numberInRange(body.swing, 'swing', 0, 100),
    volume: numberInRange(body.volume, 'volume', 0, 1),
    bank: typeof body.bank === 'string' && BANKS.has(body.bank) ? body.bank : (() => { throw new ProjectServiceError(400, 'bank is invalid'); })(),
    snapshot: validateSnapshot(body.snapshot),
  };
}

export function validateProjectId(projectId: string): string {
  if (!UUID_PATTERN.test(projectId)) throw new ProjectServiceError(400, 'projectId must be a UUID');
  return projectId;
}

export function validateOrganizationId(organizationId: string | undefined): string {
  if (!organizationId) throw new ProjectServiceError(400, 'x-organization-id is required');
  if (!UUID_PATTERN.test(organizationId)) throw new ProjectServiceError(400, 'x-organization-id must be a UUID');
  return organizationId;
}

export function toProjectResponse(record: ProjectRecord): Record<string, unknown> {
  return {
    id: record.id,
    name: record.name,
    artist: record.artist,
    bpm: record.bpm,
    swing: Number(record.swing),
    volume: Number(record.volume),
    bank: record.bank,
    snapshot: record.snapshot,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

async function requireOrganizationRole(client: RequestSupabaseClient, user: User, organizationId: string): Promise<ProjectRole> {
  const { data, error } = await client
    .from('organization_members')
    .select('role')
    .eq('organization_id', organizationId)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new ProjectServiceError(502, 'Unable to verify organization access');
  if (!data) throw new ProjectServiceError(403, 'Organization access denied');
  return data.role as ProjectRole;
}

function assertContributor(role: ProjectRole): void {
  if (role === 'viewer') throw new ProjectServiceError(403, 'Project write permission denied');
}

function assertOwnerOrAdmin(role: ProjectRole, ownerId: string, userId: string): void {
  if (role !== 'owner' && role !== 'admin' && ownerId !== userId) throw new ProjectServiceError(403, 'Project write permission denied');
}

export async function listProjects(client: RequestSupabaseClient, user: User, organizationId: string): Promise<Record<string, unknown>[]> {
  await requireOrganizationRole(client, user, organizationId);
  const { data, error } = await client
    .from('projects')
    .select('id, organization_id, owner_id, name, artist, bpm, swing, volume, bank, snapshot, created_at, updated_at, deleted_at')
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false });
  if (error) throw new ProjectServiceError(502, 'Unable to load projects');
  return (data ?? []).map((record) => toProjectResponse(record as ProjectRecord));
}

export async function getProject(client: RequestSupabaseClient, user: User, organizationId: string, projectId: string): Promise<Record<string, unknown>> {
  await requireOrganizationRole(client, user, organizationId);
  const { data, error } = await client
    .from('projects')
    .select('id, organization_id, owner_id, name, artist, bpm, swing, volume, bank, snapshot, created_at, updated_at, deleted_at')
    .eq('id', validateProjectId(projectId))
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new ProjectServiceError(502, 'Unable to load project');
  if (!data) throw new ProjectServiceError(404, 'Project not found');
  return toProjectResponse(data as ProjectRecord);
}

export async function createProject(client: RequestSupabaseClient, user: User, organizationId: string, body: unknown): Promise<Record<string, unknown>> {
  const role = await requireOrganizationRole(client, user, organizationId);
  assertContributor(role);
  const input = validateProjectInput(body);
  const { data, error } = await client
    .from('projects')
    .insert({ ...input, organization_id: organizationId, owner_id: user.id })
    .select('id, organization_id, owner_id, name, artist, bpm, swing, volume, bank, snapshot, created_at, updated_at, deleted_at')
    .single();
  if (error || !data) throw new ProjectServiceError(502, 'Unable to create project');
  return toProjectResponse(data as ProjectRecord);
}

export async function updateProject(client: RequestSupabaseClient, user: User, organizationId: string, projectId: string, body: unknown): Promise<Record<string, unknown>> {
  const role = await requireOrganizationRole(client, user, organizationId);
  const existing = await getProjectRecord(client, user, organizationId, projectId);
  assertOwnerOrAdmin(role, existing.owner_id, user.id);
  const input = validateProjectInput(body);
  const { data, error } = await client
    .from('projects')
    .update(input)
    .eq('id', existing.id)
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .select('id, organization_id, owner_id, name, artist, bpm, swing, volume, bank, snapshot, created_at, updated_at, deleted_at')
    .single();
  if (error || !data) throw new ProjectServiceError(502, 'Unable to update project');
  return toProjectResponse(data as ProjectRecord);
}

export async function deleteProject(client: RequestSupabaseClient, user: User, organizationId: string, projectId: string): Promise<void> {
  const role = await requireOrganizationRole(client, user, organizationId);
  const existing = await getProjectRecord(client, user, organizationId, projectId);
  assertOwnerOrAdmin(role, existing.owner_id, user.id);
  const { error } = await client
    .from('projects')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', existing.id)
    .eq('organization_id', organizationId)
    .is('deleted_at', null);
  if (error) throw new ProjectServiceError(502, 'Unable to delete project');
}

async function getProjectRecord(client: RequestSupabaseClient, user: User, organizationId: string, projectId: string): Promise<ProjectRecord> {
  await requireOrganizationRole(client, user, organizationId);
  const { data, error } = await client
    .from('projects')
    .select('id, organization_id, owner_id, name, artist, bpm, swing, volume, bank, snapshot, created_at, updated_at, deleted_at')
    .eq('id', validateProjectId(projectId))
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new ProjectServiceError(502, 'Unable to load project');
  if (!data) throw new ProjectServiceError(404, 'Project not found');
  return data as ProjectRecord;
}
