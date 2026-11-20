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
