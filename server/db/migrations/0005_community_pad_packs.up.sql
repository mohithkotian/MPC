BEGIN;

CREATE TABLE public.community_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 500),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE public.community_pads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id UUID NOT NULL REFERENCES public.community_packs(id) ON DELETE CASCADE,
  pad_index INTEGER NOT NULL CHECK (pad_index BETWEEN 0 AND 15),
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  storage_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL CHECK (content_type = 'audio/wav'),
  byte_size BIGINT NOT NULL CHECK (byte_size > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT community_pads_pack_index_unique UNIQUE (pack_id, pad_index)
);

CREATE INDEX community_packs_published_idx
  ON public.community_packs (published_at DESC)
  WHERE deleted_at IS NULL AND published_at IS NOT NULL;
CREATE INDEX community_packs_owner_idx
  ON public.community_packs (owner_id, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX community_pads_pack_idx
  ON public.community_pads (pack_id, pad_index);

CREATE TRIGGER community_packs_set_updated_at
  BEFORE UPDATE ON public.community_packs
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

ALTER TABLE public.community_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_pads ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_packs TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.community_pads TO authenticated;

CREATE POLICY community_packs_select_published
  ON public.community_packs FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND published_at IS NOT NULL
  );

CREATE POLICY community_packs_select_owner
  ON public.community_packs FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND owner_id = auth.uid()
  );

CREATE POLICY community_packs_insert_member
  ON public.community_packs FOR INSERT TO authenticated
  WITH CHECK (
    deleted_at IS NULL
    AND owner_id = auth.uid()
    AND app.is_active_member(organization_id)
  );

CREATE POLICY community_packs_update_owner
  ON public.community_packs FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND owner_id = auth.uid()
  )
  WITH CHECK (
    owner_id = auth.uid()
    AND organization_id = community_packs.organization_id
  );

CREATE POLICY community_packs_delete_owner
  ON public.community_packs FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY community_pads_select_published
  ON public.community_pads FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.community_packs pack
      WHERE pack.id = community_pads.pack_id
        AND pack.deleted_at IS NULL
        AND pack.published_at IS NOT NULL
    )
  );

CREATE POLICY community_pads_select_owner
  ON public.community_pads FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.community_packs pack
      WHERE pack.id = community_pads.pack_id
        AND pack.deleted_at IS NULL
        AND pack.owner_id = auth.uid()
    )
  );

CREATE POLICY community_pads_insert_owner
  ON public.community_pads FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.community_packs pack
      WHERE pack.id = community_pads.pack_id
        AND pack.deleted_at IS NULL
        AND pack.owner_id = auth.uid()
    )
  );

CREATE POLICY community_pads_delete_owner
  ON public.community_pads FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.community_packs pack
      WHERE pack.id = community_pads.pack_id
        AND pack.owner_id = auth.uid()
    )
  );

CREATE POLICY community_storage_insert_owner
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'samples'
    AND name ~* '^community/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.wav$'
    AND name !~ '\\.\\.'
    AND EXISTS (
      SELECT 1
      FROM public.community_packs pack
      WHERE pack.id = ((storage.foldername(name))[2])::uuid
        AND pack.owner_id = auth.uid()
        AND pack.deleted_at IS NULL
    )
  );

CREATE POLICY community_storage_select_published
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'samples'
    AND name ~* '^community/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.wav$'
    AND EXISTS (
      SELECT 1
      FROM public.community_pads pad
      JOIN public.community_packs pack ON pack.id = pad.pack_id
      WHERE pack.id = ((storage.foldername(name))[2])::uuid
        AND pad.storage_key = name
        AND pack.deleted_at IS NULL
        AND pack.published_at IS NOT NULL
    )
  );

CREATE POLICY community_storage_select_owner
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'samples'
    AND name ~* '^community/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.wav$'
    AND EXISTS (
      SELECT 1
      FROM public.community_pads pad
      JOIN public.community_packs pack ON pack.id = pad.pack_id
      WHERE pack.id = ((storage.foldername(name))[2])::uuid
        AND pad.storage_key = name
        AND pack.owner_id = auth.uid()
        AND pack.deleted_at IS NULL
    )
  );

COMMENT ON TABLE public.community_packs IS 'Published MPC pad packs. Only derived pad audio is shared; source tracks are not stored here.';
COMMENT ON TABLE public.community_pads IS 'Individual derived pad clips belonging to a community pack.';

COMMIT;
