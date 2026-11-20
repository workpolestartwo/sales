-- Every client must be contacted at least every N days (default 7 = once a week).
-- Tier no longer changes how often a client is due; it still decides ranking and channel.

alter table public.profiles
  add column if not exists contact_every_days int not null default 7
  check (contact_every_days between 1 and 90);

create or replace function public.refresh_client_scores(p_today date)
returns void language plpgsql security invoker set search_path = public as $$
declare
  v_max int;
  v_every int;
begin
  select greatest(max(total_shipments), 1) into v_max from clients where owner_id = auth.uid();
  select coalesce(contact_every_days, 7) into v_every from profiles where id = auth.uid();
  v_every := coalesce(v_every, 7);

  update clients c set
    value_score = s.score,
    tier = case when s.score = 0 then 'C' when s.rank_pct <= 0.2 then 'A' when s.rank_pct <= 0.5 then 'B' else 'C' end
  from (
    select id, score, cume_dist() over (order by score desc) as rank_pct
    from (
      select id,
        round(
          60 * ln(1 + total_shipments) / ln(1 + v_max)
          + case
              when last_shipment_date is null then 0
              when p_today - last_shipment_date <= 30 then 40
              when p_today - last_shipment_date <= 90 then 30
              when p_today - last_shipment_date <= 180 then 20
              when p_today - last_shipment_date <= 365 then 10
              else 0
            end
        )::int as score
      from clients where owner_id = auth.uid()
    ) raw
  ) s
  where c.id = s.id;

  -- Due = whichever comes first: a promised follow-up, or last contact + N days.
  -- A follow-up further out never pushes past the weekly rule. Never contacted = due today.
  update clients set next_due_date = coalesce(
    least(next_follow_up, greatest(last_contact_date, last_meeting_date) + v_every),
    p_today
  )
  where owner_id = auth.uid();
end $$;

grant execute on function public.refresh_client_scores(date) to authenticated;
revoke execute on function public.refresh_client_scores(date) from anon, public;
