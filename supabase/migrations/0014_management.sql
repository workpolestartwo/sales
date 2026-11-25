-- Management accounts (role = 'admin'): Director / VP. They don't sell; they see everything,
-- flag clients or salespeople, and message the team.
-- * Admins are left out of the salesperson list and the performance cards.
-- * flags: a note from management on a salesperson (optionally about one client).
--   The salesperson sees it and marks it done.
-- * messages: one conversation per salesperson, shared by all management accounts.

-------------------------------------------------------------------------------
-- Helpers
-------------------------------------------------------------------------------
create or replace function public.is_admin_user(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = p_user and role = 'admin')
$$;

-- Salespeople only (management isn't a salesperson).
create or replace function public.team_members()
returns table (id uuid, full_name text)
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(nullif(btrim(p.full_name), ''), 'Unnamed member')
  from profiles p
  where auth.uid() is not null and p.role <> 'admin'
  order by 2
$$;

-- Management accounts, so salespeople can reply to them.
create or replace function public.management_members()
returns table (id uuid, full_name text)
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(nullif(btrim(p.full_name), ''), 'Management')
  from profiles p
  where auth.uid() is not null and p.role = 'admin'
  order by 2
$$;

-- Performance cards: salespeople only.
create or replace function public.admin_team_performance(p_start date, p_end date)
returns table (
  member_id uuid, member_name text, role text,
  clients_total int, clients_top int, need_priority int, pending_requests int, untouched int,
  visits int, calls int, texts int, converted int, new_clients int,
  days_planned int, items_planned int, items_done int, last_active date,
  target_visits int, target_calls int, target_texts int
)
language sql stable security definer set search_path = public as $$
  select
    p.id, coalesce(nullif(btrim(p.full_name), ''), 'Unnamed member'), p.role,
    (select count(*)::int from clients c where c.owner_id = p.id and c.status <> 'lost' and not c.priority_pending),
    (select count(*)::int from clients c where c.owner_id = p.id and c.status <> 'lost' and not c.priority_pending and c.tier = 'A'),
    (select count(*)::int from clients c where c.owner_id = p.id and c.priority_pending),
    (select count(*)::int from client_assignments a where a.assignee_id = p.id and a.status = 'pending'),
    (select count(*)::int from clients c where c.owner_id = p.id and c.status <> 'lost' and not c.priority_pending
       and (c.last_touch_date is null or c.last_touch_date < p_end - coalesce(p.stagnant_after_days, 60))),
    (select count(*)::int from activities x where x.owner_id = p.id and x.type = 'visit' and x.activity_date between p_start and p_end),
    (select count(*)::int from activities x where x.owner_id = p.id and x.type = 'call' and x.activity_date between p_start and p_end),
    (select count(*)::int from activities x where x.owner_id = p.id and x.type = 'text' and x.activity_date between p_start and p_end),
    (select count(*)::int from activities x where x.owner_id = p.id and x.outcome = 'converted' and x.activity_date between p_start and p_end),
    (select count(*)::int from clients c where c.owner_id = p.id and c.source in ('field', 'manual')
       and (c.created_at at time zone 'Asia/Kolkata')::date between p_start and p_end),
    (select count(*)::int from day_plans d where d.owner_id = p.id and d.status <> 'draft' and d.plan_date between p_start and p_end),
    (select count(*)::int from plan_items i join day_plans d on d.id = i.plan_id
       where d.owner_id = p.id and d.plan_date between p_start and p_end and i.status <> 'dropped'),
    (select count(*)::int from plan_items i join day_plans d on d.id = i.plan_id
       where d.owner_id = p.id and d.plan_date between p_start and p_end and i.status = 'done'),
    (select max(x.activity_date) from activities x where x.owner_id = p.id),
    p.target_visits, p.target_calls, p.target_texts
  from profiles p
  where public.is_admin() and p.role <> 'admin'
  order by 2
$$;

-------------------------------------------------------------------------------
-- Admin: one salesperson's recent work, and one client's full record
-------------------------------------------------------------------------------
create or replace function public.admin_member_activity(p_member uuid, p_since date)
returns table (id uuid, type text, activity_date date, outcome text, notes text, follow_up_date date,
               is_cold boolean, created_at timestamptz, client_id uuid, company text, area text)
language sql stable security definer set search_path = public as $$
  select x.id, x.type, x.activity_date, x.outcome, x.notes, x.follow_up_date, x.is_cold, x.created_at,
         c.id, c.company, coalesce(v.area, c.area)
  from activities x
  left join clients c on c.id = x.client_id
  left join field_visits v on v.id = x.field_visit_id
  where public.is_admin() and x.owner_id = p_member and x.activity_date >= p_since
  order by x.activity_date desc, x.created_at desc
  limit 500
$$;

create or replace function public.admin_client(p_client uuid)
returns table (id uuid, company text, contact_person text, phone text, email text, area text, address text,
               industry text, total_shipments int, last_shipment_date date, last_touch_date date, next_due_date date,
               next_follow_up date, tier text, status text, priority_pending boolean, notes text,
               owner_id uuid, owner_name text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.company, c.contact_person, c.phone, c.email, c.area, c.address, c.industry, c.total_shipments,
         c.last_shipment_date, c.last_touch_date, c.next_due_date, c.next_follow_up, c.tier, c.status,
         c.priority_pending, c.notes, c.owner_id, coalesce(nullif(btrim(p.full_name), ''), 'Unnamed member'), c.created_at
  from clients c join profiles p on p.id = c.owner_id
  where public.is_admin() and c.id = p_client
$$;

create or replace function public.admin_client_activity(p_client uuid)
returns table (id uuid, type text, activity_date date, outcome text, notes text, follow_up_date date, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select x.id, x.type, x.activity_date, x.outcome, x.notes, x.follow_up_date, x.created_at
  from activities x
  where public.is_admin() and x.client_id = p_client
  order by x.activity_date desc, x.created_at desc
  limit 200
$$;

-------------------------------------------------------------------------------
-- Flags
-------------------------------------------------------------------------------
create table public.flags (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users (id) on delete cascade,
  client_id uuid references public.clients (id) on delete cascade,
  note text not null check (length(btrim(note)) between 1 and 2000),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_by_name text,
  status text not null default 'open' check (status in ('open', 'done')),
  done_note text,
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index flags_member_idx on public.flags (member_id, status);
create index flags_client_idx on public.flags (client_id) where client_id is not null;

create or replace function public.stamp_flag()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.created_by := auth.uid();
  select coalesce(nullif(btrim(full_name), ''), 'Management') into new.created_by_name from profiles where id = new.created_by;
  return new;
end $$;
create trigger flags_stamp before insert on public.flags for each row execute function public.stamp_flag();

alter table public.flags enable row level security;
create policy "management sees all, member sees own" on public.flags for select to authenticated
  using (public.is_admin() or member_id = auth.uid());
create policy "management flags" on public.flags for insert to authenticated
  with check (public.is_admin());
create policy "member or management closes" on public.flags for update to authenticated
  using (public.is_admin() or member_id = auth.uid()) with check (public.is_admin() or member_id = auth.uid());
grant select, insert on public.flags to authenticated;
grant update (status, done_note, done_at) on public.flags to authenticated;
grant all on public.flags to service_role;
revoke all on public.flags from anon;

-------------------------------------------------------------------------------
-- Messages (management <-> salesperson). A message to several people is one row
-- per recipient sharing a group_id, so it shows once in a conversation.
-------------------------------------------------------------------------------
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null,
  sender_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  recipient_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 4000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index messages_recipient_idx on public.messages (recipient_id, read_at);
create index messages_sender_idx on public.messages (sender_id, created_at desc);

alter table public.messages enable row level security;
create policy "own conversations; management sees all" on public.messages for select to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid() or public.is_admin());
-- Management can message anyone; a salesperson can only message management.
create policy "send" on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and (public.is_admin() or public.is_admin_user(recipient_id)));
create policy "mark read" on public.messages for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
grant select, insert on public.messages to authenticated;
grant update (read_at) on public.messages to authenticated;
grant all on public.messages to service_role;
revoke all on public.messages from anon;

grant execute on function public.is_admin_user(uuid), public.team_members(), public.management_members(),
  public.admin_team_performance(date, date), public.admin_member_activity(uuid, date),
  public.admin_client(uuid), public.admin_client_activity(uuid) to authenticated, service_role;
revoke execute on function public.is_admin_user(uuid), public.team_members(), public.management_members(),
  public.admin_team_performance(date, date), public.admin_member_activity(uuid, date),
  public.admin_client(uuid), public.admin_client_activity(uuid) from anon, public;
