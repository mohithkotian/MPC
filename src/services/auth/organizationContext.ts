const API_BASE = (import.meta as ImportMeta & { env?: { VITE_API_BASE?: string } }).env?.VITE_API_BASE ?? '';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class OrganizationContextError extends Error {
  constructor(public readonly status: number) {
    super('Unable to determine organization access');
    this.name = 'OrganizationContextError';
  }
}

export function organizationRequestHeaders(token: string, organizationId: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'x-organization-id': organizationId,
  };
}

export async function getActiveOrganizationId(
  token: string,
  fetcher: typeof fetch = fetch,
  apiBase = API_BASE,
): Promise<string> {
  const base = apiBase.replace(/\/+$/, '');
  const response = await fetcher(`${base}/api/me/organizations`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new OrganizationContextError(response.status);

  const body = await response.json() as { organizations?: Array<{ id?: unknown }> };
  const organizationId = body.organizations?.[0]?.id;
  if (typeof organizationId !== 'string' || !UUID_PATTERN.test(organizationId)) {
    throw new OrganizationContextError(403);
  }
  return organizationId;
}
