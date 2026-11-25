-- Polestar Sales: complete database setup for a NEW Supabase project.
-- Paste this whole file into the SQL Editor once and run it.
-- Generated from supabase/migrations/0001-0014 (those files remain the source of truth).


-- ============================================================================
-- 0001_init.sql
-- ============================================================================
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

-- ============================================================================
-- 0002_grants.sql
-- ============================================================================
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

-- ============================================================================
-- 0003_weekly_contact.sql
-- ============================================================================
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

-- ============================================================================
-- 0004_rates.sql
-- ============================================================================
-- Rates dashboard: buy rates per lane + container type, shared by the whole sales team.
-- Unlike client data, rates are visible to and editable by every signed-in member.

-------------------------------------------------------------------------------
-- Global settings (one row). Edit the markup here in SQL; it's admin-only.
--   update public.app_settings set markup_pct = 12 where id = 1;
-------------------------------------------------------------------------------
create table public.app_settings (
  id int primary key default 1 check (id = 1),
  markup_pct numeric(5, 2) not null default 10 check (markup_pct >= 0 and markup_pct <= 200),
  rate_valid_days int not null default 7 check (rate_valid_days between 1 and 60)
);
insert into public.app_settings (id) values (1);

alter table public.app_settings enable row level security;
create policy "everyone reads settings" on public.app_settings for select to authenticated using (true);
grant select on public.app_settings to authenticated;

-------------------------------------------------------------------------------
-- Rates: one row per lane (origin -> destination) per container type.
-- Updating a rate overwrites it and records who/when.
-------------------------------------------------------------------------------
create table public.rates (
  id uuid primary key default gen_random_uuid(),
  direction text not null check (direction in ('export', 'import')),
  origin text not null,
  destination text not null,
  origin_key text generated always as (lower(btrim(origin))) stored,
  destination_key text generated always as (lower(btrim(destination))) stored,
  container_type text not null check (container_type in ('20GP', '40GP', '40HC', 'LCL')),
  buy_rate numeric(12, 2) not null check (buy_rate >= 0),
  currency text not null default 'USD' check (currency in ('USD', 'INR', 'EUR')),
  valid_until date not null,
  source text,           -- agent / co-loader / line the rate came from
  notes text,
  updated_by uuid references auth.users (id) on delete set null,
  updated_by_name text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (origin_key, destination_key, container_type)
);
create index rates_direction_idx on public.rates (direction, origin_key, destination_key);

-- Stamp who changed the rate, and when, on every insert/update.
create or replace function public.stamp_rate()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_by := auth.uid();
  new.updated_at := now();
  select coalesce(full_name, 'Unknown') into new.updated_by_name from profiles where id = auth.uid();
  return new;
end $$;

create trigger rates_stamp
  before insert or update on public.rates
  for each row execute function public.stamp_rate();

alter table public.rates enable row level security;
create policy "team reads rates" on public.rates for select to authenticated using (true);
create policy "team adds rates" on public.rates for insert to authenticated with check (true);
create policy "team updates rates" on public.rates for update to authenticated using (true) with check (true);
-- Only the person who last updated a rate can delete it (fixing their own mistake).
create policy "last editor deletes" on public.rates for delete to authenticated using (updated_by = auth.uid());

grant select, insert, update, delete on public.rates to authenticated;
revoke all on public.rates, public.app_settings from anon;

-- ============================================================================
-- 0005_focus_and_stagnant.sql
-- ============================================================================
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

-- ============================================================================
-- 0006_client_dedupe.sql
-- ============================================================================
-- No duplicate clients per member.
-- Two names are the same client if they match after normalising:
--   "M/s Shree Ganesh Exports Pvt. Ltd." == "shree ganesh exports pvt ltd" == "Shree Ganesh  Exports"
-- Must stay identical to normalizeCompany() in src/lib/company-key.ts.

create or replace function public.normalize_company(t text)
returns text language sql immutable parallel safe as $$
  select coalesce(
    nullif(
      regexp_replace(
        regexp_replace(
          ' ' || regexp_replace(
                   regexp_replace(regexp_replace(lower(coalesce(t, '')), '^\s*m\s*/\s*s\.?\s*', ''), '\.', '', 'g'),
                   '[^a-z0-9]+', ' ', 'g') || ' ',
          ' (pvt|private|ltd|limited|llp|co|company|inc|corp|corporation|the|and)(?= )', ' ', 'g'
        ),
        '\s+', '', 'g'
      ),
      ''
    ),
    regexp_replace(lower(coalesce(t, '')), '[^a-z0-9]+', '', 'g')
  )
$$;

alter table public.clients
  add column if not exists company_key text generated always as (public.normalize_company(company)) stored;

-------------------------------------------------------------------------------
-- Merge duplicates that already exist, so the unique index can be created.
-- For each member + company_key, the oldest row is kept. Its blanks are filled
-- from the others, the newest dates / highest shipment count win, and all
-- history (activities, plan items) is moved onto it before the extras are removed.
-------------------------------------------------------------------------------
do $$
declare g record;
begin
  for g in
    select owner_id, company_key, (array_agg(id order by created_at, id))[1] as keep_id, array_agg(id order by created_at, id) as ids
    from public.clients
    group by owner_id, company_key
    having count(*) > 1
  loop
    update public.clients k set
      contact_person = coalesce(k.contact_person, d.contact_person),
      phone = coalesce(k.phone, d.phone),
      email = coalesce(k.email, d.email),
      area = coalesce(k.area, d.area),
      address = coalesce(k.address, d.address),
      industry = coalesce(k.industry, d.industry),
      notes = coalesce(k.notes, d.notes),
      total_shipments = greatest(k.total_shipments, d.total_shipments),
      first_shipment_date = least(k.first_shipment_date, d.first_shipment_date),
      last_shipment_date = greatest(k.last_shipment_date, d.last_shipment_date),
      last_meeting_date = greatest(k.last_meeting_date, d.last_meeting_date),
      last_contact_date = greatest(k.last_contact_date, d.last_contact_date),
      next_follow_up = coalesce(k.next_follow_up, d.next_follow_up)
    from (
      select max(contact_person) contact_person, max(phone) phone, max(email) email, max(area) area, max(address) address,
             max(industry) industry, max(notes) notes, max(total_shipments) total_shipments,
             min(first_shipment_date) first_shipment_date, max(last_shipment_date) last_shipment_date,
             max(last_meeting_date) last_meeting_date, max(last_contact_date) last_contact_date, min(next_follow_up) next_follow_up
      from public.clients where id = any (g.ids[2:])
    ) d
    where k.id = g.keep_id;

    update public.activities set client_id = g.keep_id where client_id = any (g.ids[2:]);
    update public.plan_items set client_id = g.keep_id where client_id = any (g.ids[2:]);
    delete from public.clients where id = any (g.ids[2:]);
  end loop;
end $$;

create unique index if not exists clients_owner_company_key_uniq on public.clients (owner_id, company_key);

-- ============================================================================
-- 0007_rate_stamp_admin.sql
-- ============================================================================
-- Rates are stamped with who updated them and when.
-- From the app (a signed-in member) the stamp is always automatic and can't be faked.
-- From the SQL editor / admin scripts (no signed-in user), keep the name and time given,
-- so rates can be seeded or imported on someone's behalf.

create or replace function public.stamp_rate()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    new.updated_at := coalesce(new.updated_at, now());
    new.updated_by_name := coalesce(new.updated_by_name, 'Admin');
    return new;
  end if;

  new.updated_by := auth.uid();
  new.updated_at := now();
  select coalesce(full_name, 'Unknown') into new.updated_by_name from profiles where id = auth.uid();
  return new;
end $$;

-- ============================================================================
-- 0008_reminders_templates.sql
-- ============================================================================
-- Push reminders + personal WhatsApp templates.

-------------------------------------------------------------------------------
-- Reminder settings per member
-------------------------------------------------------------------------------
alter table public.profiles
  add column if not exists notify_enabled boolean not null default true,
  add column if not exists morning_time time not null default '09:00',
  add column if not exists evening_time time not null default '18:30',
  -- Starter WhatsApp templates are given once; deleting them all doesn't bring them back.
  add column if not exists templates_seeded boolean not null default false;

-------------------------------------------------------------------------------
-- Push subscriptions (one per phone/browser a member enabled notifications on)
-------------------------------------------------------------------------------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index push_subscriptions_owner_idx on public.push_subscriptions (owner_id);
alter table public.push_subscriptions enable row level security;
create policy "own rows" on public.push_subscriptions for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- Which reminders were already sent today (written by the scheduled sender only).
create table public.notification_log (
  owner_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('morning', 'evening')),
  sent_on date not null,
  sent_at timestamptz not null default now(),
  primary key (owner_id, kind, sent_on)
);
alter table public.notification_log enable row level security;
-- No policies: only the server (service role) reads/writes this table.

-------------------------------------------------------------------------------
-- Personal WhatsApp message templates
-------------------------------------------------------------------------------
create table public.message_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index message_templates_owner_idx on public.message_templates (owner_id);
alter table public.message_templates enable row level security;
create policy "own rows" on public.message_templates for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
grant select, insert, update, delete on public.message_templates to authenticated;

-------------------------------------------------------------------------------
-- Offline sync: each log made on the phone carries a unique reference, so a log
-- that is sent twice (signal dropped mid-save, then retried) is only saved once.
-------------------------------------------------------------------------------
alter table public.activities add column if not exists client_ref text;
alter table public.field_visits add column if not exists client_ref text;
create unique index if not exists activities_owner_client_ref_uniq on public.activities (owner_id, client_ref) where client_ref is not null;
create unique index if not exists field_visits_owner_client_ref_uniq on public.field_visits (owner_id, client_ref) where client_ref is not null;

revoke all on public.push_subscriptions, public.notification_log, public.message_templates from anon;

-- ============================================================================
-- 0009_start_day.sql
-- ============================================================================
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

-- ============================================================================
-- 0010_service_role_grants.sql
-- ============================================================================
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

-- ============================================================================
-- 0011_assignments.sql
-- ============================================================================
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

-- ============================================================================
-- 0012_admin_and_team_dedupe.sql
-- ============================================================================
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

-- ============================================================================
-- 0013_approval_for_all_uploads.sql
-- ============================================================================
-- Every uploaded client goes through approval -> priority before it appears in the CRM,
-- including the uploader's own clients. Requests now carry the sheet's other columns
-- (shipments, dates, email...) so nothing is lost when the client is approved.

alter table public.client_assignments add column if not exists details jsonb not null default '{}'::jsonb;

create or replace function public.accept_assignments(p_ids uuid[])
returns int language plpgsql security invoker set search_path = public as $$
declare
  r record;
  d jsonb;
  v_client uuid;
  v_added int := 0;
begin
  for r in
    select * from client_assignments
    where id = any (p_ids) and assignee_id = auth.uid() and status = 'pending'
  loop
    d := coalesce(r.details, '{}'::jsonb);
    select id into v_client from clients where owner_id = auth.uid() and company_key = normalize_company(r.company);
    if v_client is null then
      insert into clients (
        owner_id, company, area, contact_person, phone, notes, email, address, industry,
        total_shipments, first_shipment_date, last_shipment_date, last_meeting_date, last_contact_date, next_follow_up,
        source, status, priority_pending
      ) values (
        auth.uid(), btrim(r.company), r.area, r.contact_person, r.phone, r.notes,
        nullif(d ->> 'email', ''), nullif(d ->> 'address', ''), nullif(d ->> 'industry', ''),
        coalesce((d ->> 'total_shipments')::int, 0),
        (d ->> 'first_shipment_date')::date, (d ->> 'last_shipment_date')::date,
        (d ->> 'last_meeting_date')::date, (d ->> 'last_contact_date')::date, (d ->> 'next_follow_up')::date,
        'assigned', 'active', true
      )
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

-- Passing clients to a teammate keeps their details too.
create or replace function public.reassign_assignments(p_ids uuid[], p_to uuid)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_batch uuid := gen_random_uuid();
begin
  if p_to is null or p_to = auth.uid() then
    raise exception 'Pick a teammate to pass these clients to';
  end if;
  insert into client_assignments (batch_id, assignee_id, assigned_by, company, area, contact_person, phone, notes, details)
  select v_batch, p_to, auth.uid(), company, area, contact_person, phone, notes, details
  from client_assignments
  where id = any (p_ids) and assignee_id = auth.uid() and status = 'pending';

  update client_assignments set status = 'reassigned', reassigned_to = p_to, decided_at = now()
  where id = any (p_ids) and assignee_id = auth.uid() and status = 'pending';
  return v_batch;
end $$;

grant execute on function public.accept_assignments(uuid[]), public.reassign_assignments(uuid[], uuid) to authenticated, service_role;
revoke execute on function public.accept_assignments(uuid[]), public.reassign_assignments(uuid[], uuid) from anon, public;

-- ============================================================================
-- 0014_management.sql
-- ============================================================================
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
