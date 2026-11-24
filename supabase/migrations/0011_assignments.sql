-- Client assignment: anyone uploads a list (client, area, salesperson), each salesperson
-- approves the clients put under their name (or passes them to a teammate), then sets each
-- approved client's priority. Only then does the client enter the contact cycle.

-------------------------------------------------------------------------------
-- Clients: priority chosen by the salesperson, and "waiting for priority"
-------------------------------------------------------------------------------
alter table public.clients drop constraint if exists clients_source_check;
alter table public.clients add constraint clients_source_check check (source in ('master_list', 'field', 'manual', 'assigned'));
alter table public.clients
  add column if not exists manual_tier text check (manual_tier in ('A', 'B', 'C')),
  add column if not exists priority_pending boolean not null default false;
create index if not exists clients_owner_priority_pending_idx on public.clients (owner_id) where priority_pending;

-------------------------------------------------------------------------------
-- Team directory: names only, so anyone can pick who a client belongs to
-------------------------------------------------------------------------------
create or replace function public.team_members()
returns table (id uuid, full_name text)
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(nullif(btrim(p.full_name), ''), 'Unnamed member')
  from profiles p
  where auth.uid() is not null
  order by 2
$$;
grant execute on function public.team_members() to authenticated;
revoke execute on function public.team_members() from anon, public;

-------------------------------------------------------------------------------
-- Assignments (one row per client put under a salesperson's name)
-------------------------------------------------------------------------------
create table public.client_assignments (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  assignee_id uuid not null references auth.users (id) on delete cascade,
  assigned_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  assigned_by_name text,
  company text not null,
  area text,
  contact_person text,
  phone text,
  notes text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'duplicate', 'reassigned', 'dropped')),
  client_id uuid references public.clients (id) on delete set null,
  reassigned_to uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index client_assignments_assignee_idx on public.client_assignments (assignee_id, status);
create index client_assignments_batch_idx on public.client_assignments (batch_id);

-- Stamp who assigned it (can't be faked from the app).
create or replace function public.stamp_assignment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then new.assigned_by := auth.uid(); end if;
  select coalesce(nullif(btrim(full_name), ''), 'A teammate') into new.assigned_by_name from profiles where id = new.assigned_by;
  return new;
end $$;
create trigger client_assignments_stamp before insert on public.client_assignments
  for each row execute function public.stamp_assignment();

alter table public.client_assignments enable row level security;
create policy "see mine or ones I sent" on public.client_assignments for select to authenticated
  using (assignee_id = auth.uid() or assigned_by = auth.uid());
create policy "anyone can assign" on public.client_assignments for insert to authenticated
  with check (assigned_by = auth.uid());
create policy "assignee decides" on public.client_assignments for update to authenticated
  using (assignee_id = auth.uid()) with check (assignee_id = auth.uid());
grant select, insert, update on public.client_assignments to authenticated;
grant all on public.client_assignments to service_role;
revoke all on public.client_assignments from anon;

-------------------------------------------------------------------------------
-- Approve: each approved client joins my list, waiting for me to set its priority.
-- A client already in my list (same name, however written) isn't added twice.
-------------------------------------------------------------------------------
create or replace function public.accept_assignments(p_ids uuid[])
returns int language plpgsql security invoker set search_path = public as $$
declare
  r record;
  v_client uuid;
  v_added int := 0;
begin
  for r in
    select * from client_assignments
    where id = any (p_ids) and assignee_id = auth.uid() and status = 'pending'
  loop
    select id into v_client from clients where owner_id = auth.uid() and company_key = normalize_company(r.company);
    if v_client is null then
      insert into clients (owner_id, company, area, contact_person, phone, notes, source, status, priority_pending)
      values (auth.uid(), btrim(r.company), r.area, r.contact_person, r.phone, r.notes, 'assigned', 'active', true)
      returning id into v_client;
      update client_assignments set status = 'accepted', client_id = v_client, decided_at = now() where id = r.id;
      v_added := v_added + 1;
    else
      update clients set
        area = coalesce(area, r.area),
        contact_person = coalesce(contact_person, r.contact_person),
        phone = coalesce(phone, r.phone)
      where id = v_client;
      update client_assignments set status = 'duplicate', client_id = v_client, decided_at = now() where id = r.id;
    end if;
  end loop;
  return v_added;
end $$;

-------------------------------------------------------------------------------
-- Not mine: pass these clients to a teammate as a new request from me.
-------------------------------------------------------------------------------
create or replace function public.reassign_assignments(p_ids uuid[], p_to uuid)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_batch uuid := gen_random_uuid();
begin
  if p_to is null or p_to = auth.uid() then
    raise exception 'Pick a teammate to pass these clients to';
  end if;
  insert into client_assignments (batch_id, assignee_id, assigned_by, company, area, contact_person, phone, notes)
  select v_batch, p_to, auth.uid(), company, area, contact_person, phone, notes
  from client_assignments
  where id = any (p_ids) and assignee_id = auth.uid() and status = 'pending';

  update client_assignments set status = 'reassigned', reassigned_to = p_to, decided_at = now()
  where id = any (p_ids) and assignee_id = auth.uid() and status = 'pending';
  return v_batch;
end $$;

grant execute on function public.accept_assignments(uuid[]) to authenticated;
grant execute on function public.reassign_assignments(uuid[], uuid) to authenticated;
revoke execute on function public.accept_assignments(uuid[]) from anon, public;
revoke execute on function public.reassign_assignments(uuid[], uuid) from anon, public;

-------------------------------------------------------------------------------
-- Scoring: the salesperson's chosen priority always wins. Clients waiting for a
-- priority aren't scheduled yet.
-------------------------------------------------------------------------------
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
      when c.manual_tier is not null then c.manual_tier
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
    when priority_pending then null
    when status <> 'lost' and (
      tier = 'A'
      or (status = 'prospect' and source <> 'master_list' and created_at > now() - interval '60 days')
    ) then coalesce(least(next_follow_up, last_touch_date + v_every), p_today)
    else next_follow_up
  end
  where owner_id = auth.uid();
end $$;

grant execute on function public.refresh_client_scores(date) to authenticated, service_role;
revoke execute on function public.refresh_client_scores(date) from anon, public;
