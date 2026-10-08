BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS app;

CREATE TYPE app.organization_role AS ENUM ('owner', 'admin', 'member', 'viewer');
CREATE TYPE app.sample_status AS ENUM ('pending', 'ready', 'failed', 'deleted');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  slug TEXT NOT NULL CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT organizations_slug_unique UNIQUE (slug)
);

CREATE TABLE public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role app.organization_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT organization_members_org_user_unique UNIQUE (organization_id, user_id, deleted_at)
);

CREATE TABLE public.samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  storage_key TEXT NOT NULL,
  original_name TEXT NOT NULL CHECK (length(btrim(original_name)) BETWEEN 1 AND 255),
  content_type TEXT NOT NULL CHECK (content_type IN ('audio/mpeg', 'audio/wav', 'audio/ogg')),
  byte_size BIGINT NOT NULL CHECK (byte_size > 0),
  checksum TEXT,
  kit_id TEXT,
  pad_index INTEGER CHECK (pad_index IS NULL OR pad_index BETWEEN 0 AND 63),
  status app.sample_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT samples_storage_key_unique UNIQUE (organization_id, storage_key)
);

CREATE TABLE public.audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (length(btrim(event_type)) BETWEEN 1 AND 120),
  resource_type TEXT,
  resource_id UUID,
  request_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX organization_members_organization_idx
  ON public.organization_members (organization_id)
  WHERE deleted_at IS NULL;
CREATE INDEX organization_members_user_idx
  ON public.organization_members (user_id)
  WHERE deleted_at IS NULL;
CREATE INDEX organization_members_org_role_idx
  ON public.organization_members (organization_id, role)
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX organization_members_active_unique
  ON public.organization_members (organization_id, user_id)
  WHERE deleted_at IS NULL;

CREATE INDEX organizations_created_by_idx ON public.organizations (created_by);
CREATE INDEX organizations_active_idx ON public.organizations (id) WHERE deleted_at IS NULL;

CREATE INDEX samples_organization_idx
  ON public.samples (organization_id)
  WHERE deleted_at IS NULL;
CREATE INDEX samples_organization_status_idx
  ON public.samples (organization_id, status)
  WHERE deleted_at IS NULL;
CREATE INDEX samples_organization_kit_pad_idx
  ON public.samples (organization_id, kit_id, pad_index)
  WHERE deleted_at IS NULL;
CREATE INDEX samples_uploaded_by_idx ON public.samples (uploaded_by);

CREATE INDEX audit_events_organization_created_idx
  ON public.audit_events (organization_id, created_at DESC);
CREATE INDEX audit_events_actor_created_idx
  ON public.audit_events (actor_user_id, created_at DESC);
CREATE INDEX audit_events_type_created_idx
  ON public.audit_events (event_type, created_at DESC);
CREATE INDEX audit_events_resource_idx
  ON public.audit_events (resource_type, resource_id);

CREATE OR REPLACE FUNCTION app.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER organizations_set_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER organization_members_set_updated_at
  BEFORE UPDATE ON public.organization_members
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER samples_set_updated_at
  BEFORE UPDATE ON public.samples
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE OR REPLACE FUNCTION app.prevent_sample_scope_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.organization_id <> OLD.organization_id
     OR NEW.uploaded_by <> OLD.uploaded_by
     OR NEW.storage_key <> OLD.storage_key THEN
    RAISE EXCEPTION 'sample ownership and storage scope are immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER samples_prevent_scope_change
  BEFORE UPDATE ON public.samples
  FOR EACH ROW EXECUTE FUNCTION app.prevent_sample_scope_change();

CREATE OR REPLACE FUNCTION app.is_active_member(target_organization_id UUID, target_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members member
    JOIN public.organizations organization_record
      ON organization_record.id = member.organization_id
    WHERE member.organization_id = target_organization_id
      AND member.user_id = target_user_id
      AND member.deleted_at IS NULL
      AND organization_record.deleted_at IS NULL
  );
$$;

REVOKE ALL ON FUNCTION app.is_active_member(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.is_active_member(UUID, UUID) TO authenticated;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.profiles, public.organizations, public.organization_members,
  public.samples, public.audit_events TO anon, authenticated;
GRANT INSERT, UPDATE ON public.profiles, public.samples, public.audit_events TO authenticated;
GRANT DELETE ON public.samples TO authenticated;

CREATE POLICY profiles_select_self
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() AND deleted_at IS NULL);

CREATE POLICY profiles_update_self
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() AND deleted_at IS NULL)
  WITH CHECK (id = auth.uid());

CREATE POLICY organizations_select_member
  ON public.organizations FOR SELECT TO authenticated
  USING (app.is_active_member(id) AND deleted_at IS NULL);

CREATE POLICY organization_members_select_member
  ON public.organization_members FOR SELECT TO authenticated
  USING (app.is_active_member(organization_id) AND deleted_at IS NULL);

CREATE POLICY samples_select_member
  ON public.samples FOR SELECT TO authenticated
  USING (app.is_active_member(organization_id) AND deleted_at IS NULL);

CREATE POLICY samples_insert_member
  ON public.samples FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND app.is_active_member(organization_id)
    AND EXISTS (
      SELECT 1
      FROM public.organization_members member
      WHERE member.organization_id = samples.organization_id
        AND member.user_id = auth.uid()
        AND member.deleted_at IS NULL
        AND member.role IN ('owner', 'admin', 'member')
    )
  );

CREATE POLICY samples_update_member
  ON public.samples FOR UPDATE TO authenticated
  USING (
    app.is_active_member(organization_id)
    AND EXISTS (
      SELECT 1
      FROM public.organization_members member
      WHERE member.organization_id = samples.organization_id
        AND member.user_id = auth.uid()
        AND member.deleted_at IS NULL
        AND member.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    app.is_active_member(organization_id)
    AND EXISTS (
      SELECT 1
      FROM public.organization_members member
      WHERE member.organization_id = samples.organization_id
        AND member.user_id = auth.uid()
        AND member.deleted_at IS NULL
        AND member.role IN ('owner', 'admin')
    )
  );

CREATE POLICY samples_delete_admin
  ON public.samples FOR DELETE TO authenticated
  USING (
    app.is_active_member(organization_id)
    AND EXISTS (
      SELECT 1
      FROM public.organization_members member
      WHERE member.organization_id = samples.organization_id
        AND member.user_id = auth.uid()
        AND member.deleted_at IS NULL
        AND member.role IN ('owner', 'admin')
    )
  );

CREATE POLICY audit_events_insert_actor
  ON public.audit_events FOR INSERT TO authenticated
  WITH CHECK (
    actor_user_id = auth.uid()
    AND (organization_id IS NULL OR app.is_active_member(organization_id))
  );

CREATE POLICY audit_events_select_member
  ON public.audit_events FOR SELECT TO authenticated
  USING (
    (organization_id IS NOT NULL AND app.is_active_member(organization_id))
    OR actor_user_id = auth.uid()
  );

COMMENT ON TABLE public.profiles IS 'Application profile linked one-to-one with Supabase auth.users.';
COMMENT ON TABLE public.organizations IS 'Tenant boundary. Every tenant-owned query must scope through this ID.';
COMMENT ON TABLE public.organization_members IS 'Active membership and role mapping for multi-organization users.';
COMMENT ON TABLE public.samples IS 'Sample metadata and private storage key; audio bytes are not stored here.';
COMMENT ON TABLE public.audit_events IS 'Security and business audit records with no secrets or tokens in metadata.';

COMMIT;
