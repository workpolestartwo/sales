-- Admins + team-wide duplicate detection.
--
-- * profiles.role: 'member' (default) or 'admin'. Members can't change their own role.
--   Make someone admin in the SQL editor:
--     update public.profiles set role = 'admin'
--     where id = (select id from auth.users where email = 'someone@example.com');
-- * Admin data comes only through admin_* functions, which return nothing for non-admins.
--   Row-level security is unchanged, so everyone's own screens still show only their own data.
-- * client_presence(): who already has a client (or a pending request for it), across the
--   whole team, so uploads never create the same client twice.

alter table public.profiles add column if not exists role text not null default 'member' check (role in ('member', 'admin'));

-- Members may edit their own profile, but not their role.
revoke update on public.profiles from authenticated;
grant update (
  full_name, target_visits, target_calls, target_texts, onboarded,
  contact_every_days, focus_count, stagnant_after_days,
  notify_enabled, morning_time, evening_time, templates_seeded, day_started_on
) on public.profiles to authenticated;
-- NOTE: a future migration that adds an editable profile column must grant update on it too.

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin')
$$;

-- Same duplicate key on requests, so pending requests can be matched quickly.
alter table public.client_assignments
  add column if not exists company_key text generated always as (public.normalize_company(company)) stored;
create index if not exists client_assignments_key_idx on public.client_assignments (company_key) where status = 'pending';
create index if not exists clients_company_key_idx on public.clients (company_key);

-------------------------------------------------------------------------------
-- Who already has these clients? (any salesperson, or a pending request)
-------------------------------------------------------------------------------
create or replace function public.client_presence(p_keys text[])
returns table (company_key text, owner_id uuid, owner_name text, kind text)
language sql stable security definer set search_path = public as $$
  select c.company_key, c.owner_id, coalesce(nullif(btrim(p.full_name), ''), 'Unnamed member'), 'client'
  from clients c join profiles p on p.id = c.owner_id
  where auth.uid() is not null and c.company_key = any (p_keys)
  union all
  select a.company_key, a.assignee_id, coalesce(nullif(btrim(p.full_name), ''), 'Unnamed member'), 'request'
  from client_assignments a join profiles p on p.id = a.assignee_id
  where auth.uid() is not null and a.status = 'pending' and a.company_key = any (p_keys)
$$;

-------------------------------------------------------------------------------
-- Admin: every client of every salesperson, plus requests awaiting approval
-------------------------------------------------------------------------------
create or replace function public.admin_master_list()
returns table (
  id uuid, company text, area text, contact_person text, phone text, tier text, status text,
  priority_pending boolean, last_touch_date date, next_due_date date, total_shipments int,
  source text, created_at timestamptz, owner_id uuid, owner_name text, kind text
)
language sql stable security definer set search_path = public as $$
  select c.id, c.company, c.area, c.contact_person, c.phone, c.tier, c.status,
         c.priority_pending, c.last_touch_date, c.next_due_date, c.total_shipments,
         c.source, c.created_at, c.owner_id, coalesce(nullif(btrim(p.full_name), ''), 'Unnamed member'), 'client'
  from clients c join profiles p on p.id = c.owner_id
  where public.is_admin()
  union all
  select a.id, a.company, a.area, a.contact_person, a.phone, null::text, 'awaiting approval',
         false, null::date, null::date, 0,
         'assigned', a.created_at, a.assignee_id, coalesce(nullif(btrim(p.full_name), ''), 'Unnamed member'), 'request'
  from client_assignments a join profiles p on p.id = a.assignee_id
  where a.status = 'pending' and public.is_admin()
  order by 15, 2
$$;

-------------------------------------------------------------------------------
-- Admin: performance of each salesperson for a date range (inclusive, IST dates)
-------------------------------------------------------------------------------
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
    (select count(*)::int from clients c where c.owner_id = p.id and c.status <> 'lost'),
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
  where public.is_admin()
  order by 2
$$;

grant execute on function public.is_admin(), public.client_presence(text[]), public.admin_master_list(), public.admin_team_performance(date, date) to authenticated;
revoke execute on function public.is_admin(), public.client_presence(text[]), public.admin_master_list(), public.admin_team_performance(date, date) from anon, public;
grant execute on function public.is_admin(), public.client_presence(text[]), public.admin_master_list(), public.admin_team_performance(date, date) to service_role;
