import type { DatabaseClient } from '../client';

export type OrganizationRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface OrganizationContext {
  userId: string;
  organizationId: string;
  role: OrganizationRole;
}

export interface SampleRecord {
  id: string;
  organizationId: string;
  uploadedBy: string;
  storageKey: string;
  originalName: string;
  contentType: string;
  byteSize: number;
  checksum: string | null;
  kitId: string | null;
  padIndex: number | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function assertUuid(value: string, fieldName: string): void {
  if (!UUID_PATTERN.test(value)) {
    throw new Error(`${fieldName} must be a UUID`);
  }
}

export async function resolveOrganizationContext(
  client: DatabaseClient,
  userId: string,
  requestedOrganizationId: string,
): Promise<OrganizationContext | null> {
  assertUuid(userId, 'userId');
  assertUuid(requestedOrganizationId, 'organizationId');

  const result = await client.query<{
    organization_id: string;
    role: OrganizationRole;
  }>(
    `SELECT organization_id, role
     FROM public.organization_members
     WHERE organization_id = $1
       AND user_id = $2
       AND deleted_at IS NULL
     LIMIT 1`,
    [requestedOrganizationId, userId],
  );

  const membership = result.rows[0];
  if (!membership) {
    return null;
  }

  return {
    userId,
    organizationId: membership.organization_id,
    role: membership.role,
  };
}

export async function listOrganizationsForUser(
  client: DatabaseClient,
  userId: string,
): Promise<Array<{ id: string; name: string; slug: string; role: OrganizationRole }>> {
  assertUuid(userId, 'userId');

  const result = await client.query<{
    id: string;
    name: string;
    slug: string;
    role: OrganizationRole;
  }>(
    `SELECT organization.id, organization.name, organization.slug, member.role
     FROM public.organizations organization
     JOIN public.organization_members member
       ON member.organization_id = organization.id
     WHERE member.user_id = $1
       AND member.deleted_at IS NULL
       AND organization.deleted_at IS NULL
     ORDER BY organization.name ASC`,
    [userId],
  );

  return result.rows;
}

export async function findSampleForOrganization(
  client: DatabaseClient,
  context: OrganizationContext,
  sampleId: string,
): Promise<SampleRecord | null> {
  assertUuid(context.userId, 'userId');
  assertUuid(context.organizationId, 'organizationId');
  assertUuid(sampleId, 'sampleId');

  const result = await client.query<{
    id: string;
    organization_id: string;
    uploaded_by: string;
    storage_key: string;
    original_name: string;
    content_type: string;
    byte_size: string;
    checksum: string | null;
    kit_id: string | null;
    pad_index: number | null;
    status: string;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT id, organization_id, uploaded_by, storage_key, original_name,
            content_type, byte_size, checksum, kit_id, pad_index, status,
            created_at, updated_at
     FROM public.samples
     WHERE id = $1
       AND organization_id = $2
       AND deleted_at IS NULL
     LIMIT 1`,
    [sampleId, context.organizationId],
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    organizationId: row.organization_id,
    uploadedBy: row.uploaded_by,
    storageKey: row.storage_key,
    originalName: row.original_name,
    contentType: row.content_type,
    byteSize: Number(row.byte_size),
    checksum: row.checksum,
    kitId: row.kit_id,
    padIndex: row.pad_index,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listSamplesForOrganization(
  client: DatabaseClient,
  context: OrganizationContext,
  limit = 50,
): Promise<SampleRecord[]> {
  assertUuid(context.userId, 'userId');
  assertUuid(context.organizationId, 'organizationId');
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);

  const result = await client.query<{
    id: string;
    organization_id: string;
    uploaded_by: string;
    storage_key: string;
    original_name: string;
    content_type: string;
    byte_size: string;
    checksum: string | null;
    kit_id: string | null;
    pad_index: number | null;
    status: string;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT id, organization_id, uploaded_by, storage_key, original_name,
            content_type, byte_size, checksum, kit_id, pad_index, status,
            created_at, updated_at
     FROM public.samples
     WHERE organization_id = $1
       AND deleted_at IS NULL
     ORDER BY created_at DESC
     LIMIT $2`,
    [context.organizationId, safeLimit],
  );

  return result.rows.map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    uploadedBy: row.uploaded_by,
    storageKey: row.storage_key,
    originalName: row.original_name,
    contentType: row.content_type,
    byteSize: Number(row.byte_size),
    checksum: row.checksum,
    kitId: row.kit_id,
    padIndex: row.pad_index,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}
