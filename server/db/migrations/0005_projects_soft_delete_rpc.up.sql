BEGIN;

-- Soft-delete is implemented as an UPDATE, but the table's SELECT policy
-- intentionally hides rows once deleted_at is set. PostgreSQL applies
-- SELECT policies to updated rows when UPDATE reads target rows through
-- a WHERE clause, so a normal caller-scoped UPDATE cannot perform this
-- transition even with an UPDATE WITH CHECK that allows deleted_at.
--
-- This narrowly scoped SECURITY DEFINER function performs the state change
-- while explicitly rechecking the caller, organization membership, and
-- project owner/admin role. The function owner bypasses table RLS, so these
-- checks are mandatory and intentionally repeated here.
CREATE OR REPLACE FUNCTION public.soft_delete_project(
  target_project_id UUID,
  target_organization_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  requesting_user_id UUID := auth.uid();
BEGIN
  IF requesting_user_id IS NULL
     OR target_project_id IS NULL
     OR target_organization_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF NOT app.is_active_member(target_organization_id, requesting_user_id) THEN
    RETURN FALSE;
  END IF;

  UPDATE public.projects AS project
  SET deleted_at = pg_catalog.clock_timestamp()
  WHERE project.id = target_project_id
    AND project.organization_id = target_organization_id
    AND project.deleted_at IS NULL
    AND (
      project.owner_id = requesting_user_id
      OR EXISTS (
        SELECT 1
        FROM public.organization_members AS member
        WHERE member.organization_id = project.organization_id
          AND member.user_id = requesting_user_id
          AND member.deleted_at IS NULL
          AND member.role IN ('owner', 'admin')
      )
    );

  RETURN FOUND;
END;
$function$;

REVOKE ALL PRIVILEGES ON FUNCTION public.soft_delete_project(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_project(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION public.soft_delete_project(UUID, UUID) IS
  'Soft-deletes an organization project after independently verifying the authenticated user, active membership, and owner/admin authorization.';

COMMIT;
