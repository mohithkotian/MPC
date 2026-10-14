BEGIN;

REVOKE ALL PRIVILEGES ON FUNCTION public.soft_delete_project(UUID, UUID) FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.soft_delete_project(UUID, UUID);

COMMIT;
