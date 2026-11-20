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
