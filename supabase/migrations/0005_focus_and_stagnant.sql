-- Focus list + untouched (stagnant) clients.
--
-- Reps have 200-300 clients but can only work ~60 each week. So:
--   Tier A  = the member's focus list: top N clients by score (default 60). Weekly contact rule.
--   Tier B  = the next 30% of the list. Tier C = the rest.
--   B and C are not scheduled; they're only due when a follow-up is promised.
--   New prospects added in the app stay on the weekly rule for 60 days.
--   Anyone not touched in `stagnant_after_days` (default 60) shows on the Untouched sheet.

alter table public.profiles
  add column if not exists focus_count int not null default 60 check (focus_count between 5 and 500),
  add column if not exists stagnant_after_days int not null default 60 check (stagnant_after_days between 14 and 365);

-- Most recent contact of any kind (call, text or meeting).
alter table public.clients
  add column if not exists last_touch_date date generated always as (greatest(last_contact_date, last_meeting_date)) stored;
create index if not exists clients_owner_touch_idx on public.clients (owner_id, last_touch_date);

create or replace function public.refresh_client_scores(p_today date)
returns void language plpgsql security invoker set search_path = public as $$
declare
  v_max int;
  v_total int;
  v_every int;
  v_focus int;
begin
  select greatest(max(total_shipments), 1), count(*) into v_max, v_total from clients where owner_id = auth.uid();
  select contact_every_days, focus_count into v_every, v_focus from profiles where id = auth.uid();
  v_every := coalesce(v_every, 7);
  v_focus := coalesce(v_focus, 60);

  update clients c set
    value_score = s.score,
    tier = case
      when s.score = 0 then 'C'
      when s.rn <= v_focus then 'A'
      when s.rn <= v_focus + ceil(0.3 * v_total) then 'B'
      else 'C' end
  from (
    select id, score,
      row_number() over (order by score desc, last_shipment_date desc nulls last, total_shipments desc, id) as rn
    from (
      select id, last_shipment_date, total_shipments,
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

  update clients set next_due_date = case
    -- Focus list and fresh prospects: at least every N days; a promised follow-up can only bring it forward.
    when status <> 'lost' and (
      tier = 'A'
      or (status = 'prospect' and source <> 'master_list' and created_at > now() - interval '60 days')
    ) then coalesce(least(next_follow_up, last_touch_date + v_every), p_today)
    -- Everyone else: only when a follow-up was promised.
    else next_follow_up
  end
  where owner_id = auth.uid();
end $$;

grant execute on function public.refresh_client_scores(date) to authenticated;
revoke execute on function public.refresh_client_scores(date) from anon, public;
