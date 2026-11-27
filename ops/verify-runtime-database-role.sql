-- Execute with psql -X -v ON_ERROR_STOP=1 as the application database role.
-- Run before and after additive migrations; never run as a superuser.
BEGIN READ ONLY;
DO $check$
DECLARE
  inaccessible integer;
  foreign_owned integer;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND rolsuper) THEN
    RAISE EXCEPTION 'Runtime preflight must use a non-superuser application role';
  END IF;
  SELECT count(*) FILTER (WHERE NOT has_table_privilege(current_user, c.oid, 'SELECT')),
         count(*) FILTER (WHERE NOT pg_has_role(current_user, c.relowner, 'USAGE'))
    INTO inaccessible, foreign_owned
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r','p');
  IF inaccessible > 0 OR foreign_owned > 0 THEN
    RAISE EXCEPTION 'Runtime role preflight failed: unreadable tables %, inaccessible ownership %', inaccessible, foreign_owned;
  END IF;
  RAISE NOTICE 'Runtime role preflight passed';
END
$check$;
COMMIT;
