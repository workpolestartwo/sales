-- The scheduled reminder sender uses the service_role key. On projects that don't
-- auto-grant table access to API roles, service_role needs explicit privileges too.
-- (service_role already bypasses row-level security; this only lets it reach the tables.)

grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Tables and functions added by future migrations get the same access automatically.
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;
