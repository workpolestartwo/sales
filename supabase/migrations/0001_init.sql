-- Polestar Sales CRM — initial schema
-- Run this in the Supabase SQL editor (or `supabase db push`).
-- Every table is owner-scoped with RLS: a member only ever sees their own rows.

-------------------------------------------------------------------------------
-- Profiles (one per auth user, created automatically)
-------------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  -- Daily targets. Placeholders until the company shares real goals.
  target_visits int not null default 6,
  target_calls int not null default 10,
  target_texts int not null default 15,
  onboarded boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-------------------------------------------------------------------------------
-- Clients
-------------------------------------------------------------------------------
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  company text not null,
  contact_person text,
  phone text,
  email text,
  area text,
  address text,
  industry text,
  total_shipments int not null default 0,
  first_shipment_date date,
  last_shipment_date date,
  last_meeting_date date,
  last_contact_date date,
  next_follow_up date,
  notes text,
  source text not null default 'manual' check (source in ('master_list', 'field', 'manual')),
  status text not null default 'active' check (status in ('active', 'prospect', 'dormant', 'lost')),
  -- Computed by refresh_client_scores()
  value_score int not null default 0,
  tier text not null default 'C' check (tier in ('A', 'B', 'C')),
  next_due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index clients_owner_idx on public.clients (owner_id);
create index clients_owner_due_idx on public.clients (owner_id, next_due_date);
create index clients_owner_area_idx on public.clients (owner_id, lower(area));

-------------------------------------------------------------------------------
-- Field visits (one trip to an area, e.g. "Andheri" on a given day)
-------------------------------------------------------------------------------
create table public.field_visits (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  visit_date date not null,
  area text not null,
  notes text,
  created_at timestamptz not null default now()
);
create index field_visits_owner_idx on public.field_visits (owner_id, visit_date);

-------------------------------------------------------------------------------
-- Day plans + items (the Day Builder)
-------------------------------------------------------------------------------
create table public.day_plans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plan_date date not null,
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'closed')),
  focus_area text,
  confirmed_at timestamptz,
  closed_at timestamptz,
  auto_closed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (owner_id, plan_date)
);

create table public.plan_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plan_id uuid not null references public.day_plans (id) on delete cascade,
  client_id uuid references public.clients (id) on delete cascade,
  type text not null check (type in ('visit', 'call', 'text')),
  reason text,
  source text not null default 'manual' check (source in ('suggested', 'backlog', 'manual')),
  added_after_confirm boolean not null default false,
  status text not null default 'planned' check (status in ('planned', 'done', 'missed', 'dropped')),
  created_at timestamptz not null default now()
);
create index plan_items_plan_idx on public.plan_items (plan_id);
create index plan_items_owner_client_idx on public.plan_items (owner_id, client_id, status);

-------------------------------------------------------------------------------
-- Activities (everything actually done: visits, calls, texts)
-------------------------------------------------------------------------------
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_id uuid references public.clients (id) on delete cascade,
  type text not null check (type in ('visit', 'call', 'text')),
  activity_date date not null,
  outcome text not null check (outcome in ('interested', 'follow_up', 'not_reachable', 'not_interested', 'converted', 'met', 'new_lead')),
  notes text,
  follow_up_date date,
  is_cold boolean not null default false,
  field_visit_id uuid references public.field_visits (id) on delete set null,
  plan_item_id uuid references public.plan_items (id) on delete set null,
  created_at timestamptz not null default now()
);
create index activities_owner_date_idx on public.activities (owner_id, activity_date);
create index activities_client_idx on public.activities (client_id, activity_date desc);

-------------------------------------------------------------------------------
-- Row level security
-------------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.field_visits enable row level security;
alter table public.day_plans enable row level security;
alter table public.plan_items enable row level security;
alter table public.activities enable row level security;

create policy "own profile read" on public.profiles for select using (id = auth.uid());
create policy "own profile update" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['clients', 'field_visits', 'day_plans', 'plan_items', 'activities'] loop
    execute format('create policy "own rows" on public.%I for all using (owner_id = auth.uid()) with check (owner_id = auth.uid())', t);
  end loop;
end $$;

-------------------------------------------------------------------------------
-- Priority scoring
--
-- value_score (0-100) = how valuable the client is
--   60 pts  shipment volume (log scale, relative to the member's biggest client)
--   40 pts  shipment recency (<=30d 40, <=90d 30, <=180d 20, <=365d 10)
-- tier: ranked within the member's own list (Pareto-style)
--   top 20% by score = A, next 30% = B, rest = C; score 0 (no shipments) is always C
--
-- next_due_date = when the client should next be contacted
--   explicit next_follow_up wins; otherwise last contact + cadence
--   cadence: A 7 days, B 15 days, C 30 days, prospects 10 days
--   never-contacted clients are due today
-------------------------------------------------------------------------------
create or replace function public.refresh_client_scores(p_today date)
returns void language plpgsql security invoker set search_path = public as $$
declare v_max int;
begin
  select greatest(max(total_shipments), 1) into v_max from clients where owner_id = auth.uid();

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

  update clients set next_due_date = coalesce(
    next_follow_up,
    greatest(last_contact_date, last_meeting_date)
      + case when status = 'prospect' then 10 when tier = 'A' then 7 when tier = 'B' then 15 else 30 end,
    p_today
  )
  where owner_id = auth.uid();
end $$;

-------------------------------------------------------------------------------
-- When an activity is logged, update the client's contact dates.
-------------------------------------------------------------------------------
create or replace function public.on_activity_logged()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if new.client_id is null then return new; end if;

  update clients set
    last_contact_date = greatest(coalesce(last_contact_date, new.activity_date), new.activity_date),
    last_meeting_date = case when new.type = 'visit'
      then greatest(coalesce(last_meeting_date, new.activity_date), new.activity_date)
      else last_meeting_date end,
    -- A new follow-up date replaces the old one; logging contact clears a follow-up that is now satisfied.
    next_follow_up = case
      when new.follow_up_date is not null then new.follow_up_date
      when next_follow_up is not null and next_follow_up <= new.activity_date then null
      else next_follow_up end,
    status = case
      when new.outcome = 'converted' then 'active'
      when new.outcome = 'not_interested' and status = 'prospect' then 'lost'
      else status end,
    updated_at = now()
  where id = new.client_id;
  return new;
end $$;

create trigger activity_logged
  after insert on public.activities
  for each row execute function public.on_activity_logged();

-------------------------------------------------------------------------------
-- Close any plans from previous days that the member never closed.
-- Unfinished items become 'missed' so they flow into the backlog.
-------------------------------------------------------------------------------
create or replace function public.close_stale_plans(p_today date)
returns void language plpgsql security invoker set search_path = public as $$
begin
  update plan_items pi set status = 'missed'
  from day_plans dp
  where pi.plan_id = dp.id and dp.owner_id = auth.uid()
    and dp.plan_date < p_today and dp.status <> 'closed' and pi.status = 'planned';

  update day_plans set status = 'closed', closed_at = now(), auto_closed = true
  where owner_id = auth.uid() and plan_date < p_today and status <> 'closed';
end $$;
