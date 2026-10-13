BEGIN;

DROP POLICY IF EXISTS projects_update_owner_admin ON public.projects;

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

COMMIT;
