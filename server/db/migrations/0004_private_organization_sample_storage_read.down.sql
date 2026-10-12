BEGIN;

DROP POLICY IF EXISTS organization_members_read_private_named_samples
  ON storage.objects;

COMMIT;
