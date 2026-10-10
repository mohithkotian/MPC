BEGIN;

CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  artist TEXT NOT NULL DEFAULT '' CHECK (length(artist) <= 120),
  bpm INTEGER NOT NULL CHECK (bpm BETWEEN 40 AND 240),
  swing NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (swing BETWEEN 0 AND 100),
  volume NUMERIC(4,3) NOT NULL DEFAULT 1 CHECK (volume BETWEEN 0 AND 1),
  bank CHAR(1) NOT NULL CHECK (bank IN ('A', 'B', 'C', 'D')),
  snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX projects_organization_updated_idx
  ON public.projects (organization_id, updated_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX projects_owner_updated_idx
  ON public.projects (owner_id, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION app.enforce_project_owner_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
  ) THEN
    RAISE EXCEPTION 'project ownership scope is immutable';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organizations organization_record
    JOIN public.organization_members member
      ON member.organization_id = organization_record.id
    WHERE organization_record.id = NEW.organization_id
      AND organization_record.deleted_at IS NULL
      AND member.user_id = NEW.owner_id
      AND member.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'project owner must be an active member of the organization';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER projects_owner_membership_guard
  BEFORE INSERT OR UPDATE OF organization_id, owner_id ON public.projects
  FOR EACH ROW EXECUTE FUNCTION app.enforce_project_owner_membership();

CREATE TRIGGER projects_set_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;

CREATE POLICY projects_select_active_member
  ON public.projects FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND app.is_active_member(organization_id)
  );

CREATE POLICY projects_insert_contributor
  ON public.projects FOR INSERT TO authenticated
  WITH CHECK (
    deleted_at IS NULL
    AND owner_id = auth.uid()
    AND app.is_active_member(organization_id)
    AND EXISTS (
      SELECT 1
      FROM public.organization_members member
      WHERE member.organization_id = projects.organization_id
        AND member.user_id = auth.uid()
        AND member.deleted_at IS NULL
        AND member.role IN ('owner', 'admin', 'member')
    )
  );

CREATE POLICY projects_update_owner_admin
  ON public.projects FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND app.is_active_member(organization_id)
    AND (
      owner_id = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.organization_members member
        WHERE member.organization_id = projects.organization_id
          AND member.user_id = auth.uid()
          AND member.deleted_at IS NULL
          AND member.role IN ('owner', 'admin')
      )
    )
  )
  WITH CHECK (
    deleted_at IS NULL
    AND app.is_active_member(organization_id)
    AND owner_id = projects.owner_id
    AND organization_id = projects.organization_id
  );

CREATE POLICY projects_delete_owner_admin
  ON public.projects FOR DELETE TO authenticated
  USING (
    deleted_at IS NULL
    AND app.is_active_member(organization_id)
    AND (
      owner_id = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.organization_members member
        WHERE member.organization_id = projects.organization_id
          AND member.user_id = auth.uid()
          AND member.deleted_at IS NULL
          AND member.role IN ('owner', 'admin')
      )
    )
  );

COMMENT ON TABLE public.projects IS 'Organization-scoped deterministic MPC project snapshots. Audio bytes remain outside project JSON.';

COMMIT;
