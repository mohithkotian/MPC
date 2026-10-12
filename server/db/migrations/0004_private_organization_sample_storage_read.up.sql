BEGIN;

CREATE POLICY organization_members_read_private_named_samples
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'samples'
    AND (storage.foldername(name))[1] = 'organizations'
    AND (storage.foldername(name))[3] = 'samples'
    AND (storage.foldername(name))[4] IN ('father', 'runaway')
    AND (storage.foldername(name))[5] IS NULL
    AND name ~* '^organizations/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/samples/(father|runaway)/[a-z0-9][a-z0-9._-]*\.mp3$'
    AND name !~ '\.\.'
    AND CASE
      WHEN (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN app.is_active_member(((storage.foldername(name))[2])::uuid)
      ELSE FALSE
    END
  );

COMMIT;
