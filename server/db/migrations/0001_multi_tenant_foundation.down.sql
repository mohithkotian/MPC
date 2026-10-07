BEGIN;

DROP POLICY IF EXISTS audit_events_select_member ON public.audit_events;
DROP POLICY IF EXISTS audit_events_insert_actor ON public.audit_events;
DROP POLICY IF EXISTS samples_delete_admin ON public.samples;
DROP POLICY IF EXISTS samples_update_member ON public.samples;
DROP POLICY IF EXISTS samples_insert_member ON public.samples;
DROP POLICY IF EXISTS samples_select_member ON public.samples;
DROP POLICY IF EXISTS organization_members_select_member ON public.organization_members;
DROP POLICY IF EXISTS organizations_select_member ON public.organizations;
DROP POLICY IF EXISTS profiles_update_self ON public.profiles;
DROP POLICY IF EXISTS profiles_select_self ON public.profiles;

ALTER TABLE public.audit_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.samples DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS samples_prevent_scope_change ON public.samples;
DROP TRIGGER IF EXISTS samples_set_updated_at ON public.samples;
DROP TRIGGER IF EXISTS organization_members_set_updated_at ON public.organization_members;
DROP TRIGGER IF EXISTS organizations_set_updated_at ON public.organizations;
DROP TRIGGER IF EXISTS profiles_set_updated_at ON public.profiles;

DROP FUNCTION IF EXISTS app.prevent_sample_scope_change();
DROP FUNCTION IF EXISTS app.is_active_member(UUID, UUID);
DROP FUNCTION IF EXISTS app.set_updated_at();

DROP TABLE IF EXISTS public.audit_events;
DROP TABLE IF EXISTS public.samples;
DROP TABLE IF EXISTS public.organization_members;
DROP TABLE IF EXISTS public.organizations;
DROP TABLE IF EXISTS public.profiles;

DROP TYPE IF EXISTS app.sample_status;
DROP TYPE IF EXISTS app.organization_role;
DROP SCHEMA IF EXISTS app;

COMMIT;
