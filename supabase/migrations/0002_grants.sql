-- Table access for signed-in users only.
-- Some Supabase projects don't auto-grant new tables to the API roles.
-- Logged-out (anon) users get nothing; RLS still limits each member to their own rows.

grant usage on schema public to authenticated;

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on
  public.clients,
  public.field_visits,
  public.day_plans,
  public.plan_items,
  public.activities
to authenticated;

revoke all on
  public.profiles,
  public.clients,
  public.field_visits,
  public.day_plans,
  public.plan_items,
  public.activities
from anon;

grant execute on function public.refresh_client_scores(date) to authenticated;
grant execute on function public.close_stale_plans(date) to authenticated;
revoke execute on function public.refresh_client_scores(date) from anon, public;
revoke execute on function public.close_stale_plans(date) from anon, public;
