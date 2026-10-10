BEGIN;

DROP TRIGGER IF EXISTS projects_set_updated_at ON public.projects;
DROP TRIGGER IF EXISTS projects_owner_membership_guard ON public.projects;
DROP POLICY IF EXISTS projects_delete_owner_admin ON public.projects;
DROP POLICY IF EXISTS projects_update_owner_admin ON public.projects;
DROP POLICY IF EXISTS projects_insert_contributor ON public.projects;
DROP POLICY IF EXISTS projects_select_active_member ON public.projects;
DROP FUNCTION IF EXISTS app.enforce_project_owner_membership();
DROP TABLE IF EXISTS public.projects;

COMMIT;
