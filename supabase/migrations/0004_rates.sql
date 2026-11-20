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
