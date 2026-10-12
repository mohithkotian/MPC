BEGIN;

DROP POLICY IF EXISTS community_storage_select_owner ON storage.objects;
DROP POLICY IF EXISTS community_storage_select_published ON storage.objects;
DROP POLICY IF EXISTS community_storage_insert_owner ON storage.objects;
DROP POLICY IF EXISTS community_pads_delete_owner ON public.community_pads;
DROP POLICY IF EXISTS community_pads_insert_owner ON public.community_pads;
DROP POLICY IF EXISTS community_pads_select_owner ON public.community_pads;
DROP POLICY IF EXISTS community_pads_select_published ON public.community_pads;
DROP POLICY IF EXISTS community_packs_delete_owner ON public.community_packs;
DROP POLICY IF EXISTS community_packs_update_owner ON public.community_packs;
DROP POLICY IF EXISTS community_packs_insert_member ON public.community_packs;
DROP POLICY IF EXISTS community_packs_select_owner ON public.community_packs;
DROP POLICY IF EXISTS community_packs_select_published ON public.community_packs;

DROP TRIGGER IF EXISTS community_packs_set_updated_at ON public.community_packs;
DROP TABLE IF EXISTS public.community_pads;
DROP TABLE IF EXISTS public.community_packs;

COMMIT;
