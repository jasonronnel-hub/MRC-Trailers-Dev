-- Table-level grants for Supabase's API roles. RLS (migration ..07) decides
-- WHICH ROWS a user sees; these grants decide whether the role may touch the
-- table at all. anon deliberately gets NOTHING (Spec §3: no anon access).

grant usage on schema public to authenticated, service_role;

grant all on all tables in schema public to service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated, service_role;

-- Same for tables created by future migrations.
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated, service_role;

-- Belt and braces: make sure anon holds no table privileges in public.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
