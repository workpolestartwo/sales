-- Speed: the daily housekeeping (close yesterday's plans, re-score clients) used to run
-- on every visit to Today, as separate round trips. Now it's one call that only does
-- the work on the first visit of the day. Logging activity still re-scores immediately.

alter table public.profiles add column if not exists day_started_on date;

create or replace function public.start_day(p_today date)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if exists (select 1 from profiles where id = auth.uid() and day_started_on = p_today) then
    return;
  end if;
  perform public.close_stale_plans(p_today);
  perform public.refresh_client_scores(p_today);
  update profiles set day_started_on = p_today where id = auth.uid();
end $$;

grant execute on function public.start_day(date) to authenticated;
revoke execute on function public.start_day(date) from anon, public;
