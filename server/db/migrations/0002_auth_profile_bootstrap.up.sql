BEGIN;

CREATE POLICY profiles_insert_self
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

COMMIT;
