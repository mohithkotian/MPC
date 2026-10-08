BEGIN;

DROP POLICY IF EXISTS profiles_insert_self
  ON public.profiles;

COMMIT;
